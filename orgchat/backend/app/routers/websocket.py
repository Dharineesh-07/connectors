import asyncio
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_context
from app.models.call import Call, CallParticipant
from app.models.conversation import ConversationMember
from app.models.message import Message, MessageReceipt
from app.models.user import User
from app.utils.jwt import decode_token

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Connection Manager ─────────────────────────────────────────────────────────

from app.services import message_service

class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: dict[str, set[WebSocket]] = {}

    # ── lifecycle ──────────────────────────────────────────────────────────────

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        connections = self.active_connections.setdefault(user_id, set())
        was_online = bool(connections)
        connections.add(websocket)

        async with get_db_context() as db:
            user = await db.get(User, user_id)
            if user:
                user.is_online = True
                user.status = "online"
                user.last_seen = datetime.utcnow()
                await db.commit()
                
                # Mark all messages in user's conversations as delivered
                await message_service.mark_all_as_delivered(db, user_id)

            if not was_online:
                await self._notify_presence(db, user_id, online=True, status="online")

    async def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        connections = self.active_connections.get(user_id)
        if connections:
            connections.discard(websocket)
            if connections:
                return
            self.active_connections.pop(user_id, None)

        async with get_db_context() as db:
            user = await db.get(User, user_id)
            if user:
                user.is_online = False
                user.status = "offline"
                user.last_seen = datetime.utcnow()
                await db.commit()
            await self._notify_presence(db, user_id, online=False, status="offline")

    # ── send helpers ───────────────────────────────────────────────────────────

    async def send_to_user(
        self, user_id: str, event_type: str, data: dict
    ) -> None:
        sockets = self.active_connections.get(user_id)
        if not sockets:
            return

        for ws in list(sockets):
            try:
                await ws.send_json(
                    {"type": event_type, "data": data, "ts": datetime.utcnow().isoformat()}
                )
            except Exception:
                sockets.discard(ws)

        if not sockets:
            self.active_connections.pop(user_id, None)

    async def send_to_conversation(
        self,
        conversation_id: str,
        event_type: str,
        data: dict,
        exclude_user_id: Optional[str] = None,
    ) -> None:
        async with get_db_context() as db:
            rows = await db.execute(
                select(ConversationMember.user_id).where(
                    ConversationMember.conversation_id == conversation_id
                )
            )
            member_ids = [r[0] for r in rows]

        for uid in member_ids:
            if uid != exclude_user_id:
                await self.send_to_user(uid, event_type, data)

    async def broadcast(self, event_type: str, data: dict) -> None:
        for uid in list(self.active_connections):
            await self.send_to_user(uid, event_type, data)

    # ── presence helpers ───────────────────────────────────────────────────────

    async def _notify_presence(
        self, db: AsyncSession, user_id: str, online: bool, status: str = "offline"
    ) -> None:
        """Notify active clients about this user's presence and status."""
        # Broadcast for backward compatibility
        event = "user:online" if online else "user:offline"
        
        payload = {
            "user_id": user_id, 
            "online": online,
            "status": status,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        for contact_id in list(self.active_connections):
            if contact_id != user_id:
                await self.send_to_user(contact_id, event, payload)
                # Also send the unified presence event
                await self.send_to_user(contact_id, "user:presence", payload)

    async def online_contacts(self, user_id: str) -> list[dict]:
        """Return users connected to this API process with their status."""
        async with get_db_context() as db:
            result = await db.execute(
                select(User).where(User.id.in_(list(self.active_connections.keys())))
            )
            users = result.scalars().all()
            return [{"user_id": u.id, "status": u.status} for u in users if u.id != user_id]


manager = ConnectionManager()


# ── Inbound event handlers ─────────────────────────────────────────────────────

async def _handle_status_update(
    ws_manager: ConnectionManager, db: AsyncSession, user_id: str, data: dict
) -> None:
    status = data.get("status", "online")
    user = await db.get(User, user_id)
    if user:
        # Never let a client-side status ping downgrade an active call status
        if user.status == "busy":
            return
        user.status = status
        await db.commit()
        await ws_manager._notify_presence(db, user_id, online=True, status=status)


async def _handle_typing(
    ws_manager: ConnectionManager, db: AsyncSession, user_id: str, data: dict
) -> None:
    conversation_id = data.get("conversation_id", "")
    is_typing = bool(data.get("is_typing", False))
    await ws_manager.send_to_conversation(
        conversation_id,
        "message:typing",
        {
            "user_id": user_id,
            "conversation_id": conversation_id,
            "is_typing": is_typing,
            "timestamp": datetime.utcnow().isoformat(),
        },
        exclude_user_id=user_id,
    )


async def _handle_message_read(
    ws_manager: ConnectionManager, db: AsyncSession, user_id: str, data: dict
) -> None:
    message_id = data.get("message_id", "")
    msg = await db.get(Message, message_id)
    if not msg:
        return

    result = await db.execute(
        select(MessageReceipt).where(
            MessageReceipt.message_id == message_id,
            MessageReceipt.user_id == user_id,
        )
    )
    receipt = result.scalar_one_or_none()
    now = datetime.utcnow()

    if receipt is None:
        receipt = MessageReceipt(message_id=message_id, user_id=user_id, status="read")
        db.add(receipt)
    else:
        receipt.status = "read"
        receipt.timestamp = now
    await db.commit()

    await ws_manager.send_to_user(
        msg.sender_id,
        "message:read_receipt",
        {
            "message_id": message_id,
            "user_id": user_id,
            "status": "read",
            "timestamp": now.isoformat(),
        },
    )


async def auto_end_unanswered_call(ws_manager: ConnectionManager, call_id: str, conversation_id: str, initiated_by: str):
    await asyncio.sleep(30)  # Wait 30 seconds
    async with get_db_context() as db:
        call = await db.get(Call, call_id)
        if call and call.status == "initiated":
            # Call was never answered, so end it
            call.status = "missed"
            call.ended_at = datetime.utcnow()

            # Reset caller's status back to online
            caller = await db.get(User, initiated_by)
            if caller:
                caller.status = "online"

            await db.commit()

            if caller:
                await ws_manager._notify_presence(db, initiated_by, online=True, status="online")

            # Notify caller that the call timed out
            await ws_manager.send_to_user(
                initiated_by,
                "call:timeout",
                {
                    "call_id": call_id,
                    "message": "User did not respond to the call",
                    "timestamp": datetime.utcnow().isoformat(),
                }
            )

            # Also notify the callee so their ringing stops
            await ws_manager.send_to_conversation(
                conversation_id,
                "call:timeout",
                {
                    "call_id": call_id,
                    "timestamp": datetime.utcnow().isoformat(),
                },
                exclude_user_id=initiated_by
            )


async def _handle_call_initiate(
    ws_manager: ConnectionManager, db: AsyncSession, user_id: str, data: dict
) -> None:
    conversation_id = data.get("conversation_id", "")
    call_type = data.get("type", "audio")
    offer_sdp = data.get("offer_sdp")
    call_id = data.get("call_id")

    if not call_id:
        return

    call = await db.get(Call, call_id)
    if not call:
        return

    caller = await db.get(User, user_id)
    caller_info = {
        "id": caller.id,
        "full_name": caller.full_name,
        "avatar_url": caller.avatar_url,
    }

    # Update caller status to busy
    caller.status = "busy"
    await db.commit()
    await ws_manager._notify_presence(db, user_id, online=True, status="busy")

    targets = await db.execute(
        select(ConversationMember.user_id).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id != user_id,
        )
    )
    target_ids = [r[0] for r in targets]

    for target_id in target_ids:
        await ws_manager.send_to_user(
            target_id,
            "call:incoming",
            {
                "call_id": call.id,
                "caller": caller_info,
                "type": call_type,
                "offer_sdp": offer_sdp,
                "conversation_id": conversation_id,
                "timestamp": datetime.utcnow().isoformat(),
            },
        )

    # Start the 2-minute timeout task
    asyncio.create_task(auto_end_unanswered_call(ws_manager, call.id, conversation_id, user_id))


async def _handle_call_answer(
    ws_manager: ConnectionManager, db: AsyncSession, user_id: str, data: dict
) -> None:
    call_id = data.get("call_id", "")
    answer_sdp = data.get("answer_sdp")

    call = await db.get(Call, call_id)
    if not call:
        return

    call.status = "ongoing"

    existing_part = await db.execute(
        select(CallParticipant).where(
            CallParticipant.call_id == call_id,
            CallParticipant.user_id == user_id,
        )
    )
    participant = existing_part.scalar_one_or_none()

    if participant:
        participant.joined_at = datetime.utcnow()
        participant.status = "joined"
    else:
        db.add(
            CallParticipant(
                call_id=call_id,
                user_id=user_id,
                joined_at=datetime.utcnow(),
                status="joined",
            )
        )

    # Update user status to busy
    user = await db.get(User, user_id)
    if user:
        user.status = "busy"

    await db.commit()
    await ws_manager._notify_presence(db, user_id, online=True, status="busy")

    answerer_info = None
    if user:
        answerer_info = {
            "id": user.id,
            "full_name": user.full_name,
            "avatar_url": user.avatar_url,
        }

    await ws_manager.send_to_user(
        call.initiated_by,
        "call:answered",
        {
            "call_id": call_id,
            "user_id": user_id,
            "user": answerer_info,
            "answer_sdp": answer_sdp,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )

    # Notify ALL other joined participants (including the initiator) about the new
    # joiner so every participant can establish a direct P2P mesh connection.
    # The initiator is included here because their pendingPcRef may already be
    # consumed by a previous answerer in group calls — this lets them open a fresh
    # peer connection to this second/third/... answerer.
    other_parts = await db.execute(
        select(CallParticipant).where(
            CallParticipant.call_id == call_id,
            CallParticipant.status == "joined",
            CallParticipant.user_id != user_id,
        )
    )
    for p in other_parts.scalars().all():
        await ws_manager.send_to_user(
            p.user_id,
            "call:participant_joined",
            {
                "call_id": call_id,
                "user_id": user_id,
                "user": answerer_info,
                "timestamp": datetime.utcnow().isoformat(),
            },
        )


async def _handle_call_reject(
    ws_manager: ConnectionManager, db: AsyncSession, user_id: str, data: dict
) -> None:
    call_id = data.get("call_id", "")

    call = await db.get(Call, call_id)
    if not call:
        return

    call.status = "missed"
    call.ended_at = datetime.utcnow()

    existing = await db.execute(
        select(CallParticipant).where(
            CallParticipant.call_id == call_id,
            CallParticipant.user_id == user_id,
        )
    )
    participant = existing.scalar_one_or_none()
    if participant:
        participant.status = "missed"

    # Reset caller's status back to online
    caller = await db.get(User, call.initiated_by)
    if caller:
        caller.status = "online"

    await db.commit()

    if caller:
        await ws_manager._notify_presence(db, call.initiated_by, online=True, status="online")

    reject_payload = {
        "call_id": call_id,
        "user_id": user_id,
        "timestamp": datetime.utcnow().isoformat(),
    }
    await ws_manager.send_to_user(call.initiated_by, "call:rejected", reject_payload)
    # Also notify the rejecter so their call history page refetches
    if user_id != call.initiated_by:
        await ws_manager.send_to_user(user_id, "call:rejected", reject_payload)


async def _handle_ice_candidate(
    ws_manager: ConnectionManager, db: AsyncSession, user_id: str, data: dict
) -> None:
    target_user_id = data.get("target_user_id", "")
    call_id = data.get("call_id", "")
    candidate = data.get("candidate")

    payload = {
        "call_id": call_id,
        "user_id": user_id,
        "candidate": candidate,
        "timestamp": datetime.utcnow().isoformat(),
    }

    if target_user_id:
        await ws_manager.send_to_user(target_user_id, "call:ice-candidate", payload)
    else:
        # Broadcast to all joined participants and the initiator (fallback for initial 2-person call)
        call = await db.get(Call, call_id)
        notified: set[str] = set()

        active_parts = await db.execute(
            select(CallParticipant).where(
                CallParticipant.call_id == call_id,
                CallParticipant.user_id != user_id,
            )
        )
        for p in active_parts.scalars().all():
            if p.user_id not in notified:
                notified.add(p.user_id)
                await ws_manager.send_to_user(p.user_id, "call:ice-candidate", payload)

        if call and call.initiated_by != user_id and call.initiated_by not in notified:
            await ws_manager.send_to_user(call.initiated_by, "call:ice-candidate", payload)


async def _handle_call_end(
    ws_manager: ConnectionManager, db: AsyncSession, user_id: str, data: dict
) -> None:
    call_id = data.get("call_id", "")

    call = await db.get(Call, call_id)
    if not call:
        return

    now = datetime.utcnow()
    call.status = "ended"
    call.ended_at = now
    if call.started_at:
        call.duration_seconds = max(0, int((now - call.started_at).total_seconds()))

    active_parts = await db.execute(
        select(CallParticipant).where(
            CallParticipant.call_id == call_id,
            CallParticipant.status == "joined",
        )
    )
    notify_ids: list[str] = []
    for p in active_parts.scalars().all():
        p.left_at = now
        p.status = "left"
        notify_ids.append(p.user_id)

        u = await db.get(User, p.user_id)
        if u:
            u.status = "online"
            await ws_manager._notify_presence(db, u.id, online=True, status="online")

    # Also notify participants still ringing (missed/invited = never joined)
    ringing_parts = await db.execute(
        select(CallParticipant).where(
            CallParticipant.call_id == call_id,
            CallParticipant.status.in_(["missed", "invited"]),
        )
    )
    for p in ringing_parts.scalars().all():
        if p.user_id not in notify_ids:
            notify_ids.append(p.user_id)

    # Reset initiator status
    initiator = await db.get(User, call.initiated_by)
    if initiator:
        initiator.status = "online"
        await ws_manager._notify_presence(db, initiator.id, online=True, status="online")

    await db.commit()

    for pid in notify_ids:
        if pid != user_id:
            await ws_manager.send_to_user(
                pid,
                "call:ended",
                {
                    "call_id": call_id,
                    "ended_by": user_id,
                    "duration_seconds": call.duration_seconds,
                    "timestamp": now.isoformat(),
                },
            )


async def _handle_call_join(
    ws_manager: ConnectionManager, db: AsyncSession, user_id: str, data: dict
) -> None:
    call_id = data.get("call_id", "")

    call = await db.get(Call, call_id)
    if not call:
        return

    existing = await db.execute(
        select(CallParticipant).where(
            CallParticipant.call_id == call_id,
            CallParticipant.user_id == user_id,
        )
    )
    participant = existing.scalar_one_or_none()
    
    if not participant:
        db.add(
            CallParticipant(
                call_id=call_id,
                user_id=user_id,
                joined_at=datetime.utcnow(),
                status="joined",
            )
        )
    else:
        participant.status = "joined"
        participant.joined_at = datetime.utcnow()

    # Update user status to busy
    user = await db.get(User, user_id)
    if user:
        user.status = "busy"

    await db.commit()
    await ws_manager._notify_presence(db, user_id, online=True, status="busy")

    joining_user_info = None
    if user:
        joining_user_info = {
            "id": user.id,
            "full_name": user.full_name,
            "avatar_url": user.avatar_url,
        }

    active_parts = await db.execute(
        select(CallParticipant).where(
            CallParticipant.call_id == call_id,
            CallParticipant.status == "joined",
            CallParticipant.user_id != user_id,
        )
    )
    for p in active_parts.scalars().all():
        await ws_manager.send_to_user(
            p.user_id,
            "call:participant_joined",
            {
                "call_id": call_id,
                "user_id": user_id,
                "user": joining_user_info,
                "timestamp": datetime.utcnow().isoformat(),
            },
        )


async def _handle_screen_share(
    ws_manager: ConnectionManager, db: AsyncSession, user_id: str, data: dict
) -> None:
    call_id = data.get("call_id", "")
    is_sharing = data.get("is_sharing", False)

    active_parts = await db.execute(
        select(CallParticipant).where(
            CallParticipant.call_id == call_id,
            CallParticipant.status == "joined",
        )
    )
    for p in active_parts.scalars().all():
        if p.user_id != user_id:
            await ws_manager.send_to_user(
                p.user_id,
                "call:screen-share",
                {
                    "call_id": call_id,
                    "user_id": user_id,
                    "is_sharing": is_sharing,
                    "timestamp": datetime.utcnow().isoformat(),
                },
            )


async def _handle_peer_offer(
    ws_manager: ConnectionManager, db: AsyncSession, user_id: str, data: dict
) -> None:
    target_user_id = data.get("target_user_id", "")
    call_id = data.get("call_id", "")
    offer_sdp = data.get("offer_sdp")

    if not target_user_id:
        return

    sender = await db.get(User, user_id)
    sender_info = None
    if sender:
        sender_info = {
            "id": sender.id,
            "full_name": sender.full_name,
            "avatar_url": sender.avatar_url,
        }

    await ws_manager.send_to_user(
        target_user_id,
        "call:peer_offer",
        {
            "call_id": call_id,
            "from_user_id": user_id,
            "from_user": sender_info,
            "offer_sdp": offer_sdp,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )


async def _handle_peer_answer(
    ws_manager: ConnectionManager, db: AsyncSession, user_id: str, data: dict
) -> None:
    target_user_id = data.get("target_user_id", "")
    call_id = data.get("call_id", "")
    answer_sdp = data.get("answer_sdp")

    if not target_user_id:
        return

    await ws_manager.send_to_user(
        target_user_id,
        "call:peer_answer",
        {
            "call_id": call_id,
            "from_user_id": user_id,
            "answer_sdp": answer_sdp,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )


_EVENT_HANDLERS = {
    "user:status": _handle_status_update,
    "message:typing": _handle_typing,
    "message:read": _handle_message_read,
    "call:initiate": _handle_call_initiate,
    "call:answer": _handle_call_answer,
    "call:reject": _handle_call_reject,
    "call:ice-candidate": _handle_ice_candidate,
    "call:end": _handle_call_end,
    "call:join": _handle_call_join,
    "call:screen-share": _handle_screen_share,
    "call:peer_offer": _handle_peer_offer,
    "call:peer_answer": _handle_peer_answer,
}


# ── WebSocket endpoint ─────────────────────────────────────────────────────────

@router.websocket("/ws/connect")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
) -> None:
    """
    Authenticated WebSocket connection.
    Pass the JWT access token as ?token=<access_token>.
    Closes with code 4001 on invalid/expired token or inactive user.
    """
    # ── auth ──────────────────────────────────────────────────────────────────
    try:
        payload = decode_token(token)
    except Exception:
        await websocket.close(code=4001)
        return

    if payload.get("type") != "access":
        await websocket.close(code=4001)
        return

    user_id: str = payload.get("sub", "")
    if not user_id:
        await websocket.close(code=4001)
        return

    async with get_db_context() as db:
        user = await db.get(User, user_id)
        if not user or not user.is_active:
            await websocket.close(code=4001)
            return

    await websocket.accept()
    await manager.connect(user_id, websocket)
    logger.info("WS connected: user_id=%s", user_id)

    await manager.send_to_user(
        user_id,
        "connection:established",
        {
            "user_id": user_id,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )

    online_users_data = await manager.online_contacts(user_id)

    await manager.send_to_user(
        user_id,
        "presence:snapshot",
        {
            "users": online_users_data,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )

    # ── event loop ─────────────────────────────────────────────────────────────
    try:
        while True:
            try:
                raw = await websocket.receive_json()
            except Exception:
                break

            event_type: str = raw.get("type", "")
            event_data: dict = raw.get("data", {})

            handler = _EVENT_HANDLERS.get(event_type)
            if handler:
                try:
                    async with get_db_context() as db:
                        await handler(manager, db, user_id, event_data)
                except Exception as exc:
                    logger.exception("Error handling WS event %s: %s", event_type, exc)
            else:
                logger.debug("Unhandled WS event type: %s", event_type)

    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(user_id, websocket)
        logger.info("WS disconnected: user_id=%s", user_id)
