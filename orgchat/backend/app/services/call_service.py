import base64
import hashlib
import hmac
import time
from datetime import datetime
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.call import Call, CallParticipant
from app.models.conversation import Conversation, ConversationMember


# ── TURN credential generation ─────────────────────────────────────────────────

def generate_turn_credentials(user_id: str) -> dict:
    """
    Generate time-limited TURN credentials using HMAC-SHA1 (Coturn compatible).
    username = "<expiry_unix_ts>:<user_id>"
    credential = base64(HMAC-SHA1(TURN_CREDENTIAL, username))
    """
    if not settings.TURN_SERVER_URL:
        return {"url": "", "username": "", "credential": ""}

    expiry = int(time.time()) + 86_400  # valid for 24 hours
    username = f"{expiry}:{user_id}"
    secret = settings.TURN_CREDENTIAL or "changeme"

    raw_hmac = hmac.new(
        secret.encode("utf-8"),
        username.encode("utf-8"),
        hashlib.sha1,
    )
    credential = base64.b64encode(raw_hmac.digest()).decode("utf-8")

    return {
        "url": settings.TURN_SERVER_URL,
        "username": username,
        "credential": credential,
    }


# ── helpers ────────────────────────────────────────────────────────────────────

async def _require_conversation_member(
    db: AsyncSession, conversation_id: str, user_id: str
) -> None:
    result = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this conversation",
        )


async def _load_call(db: AsyncSession, call_id: str) -> Call:
    result = await db.execute(
        select(Call)
        .options(
            selectinload(Call.participants).selectinload(CallParticipant.user),
            selectinload(Call.initiator),
            selectinload(Call.conversation),
        )
        .where(Call.id == call_id)
    )
    call = result.scalar_one_or_none()
    if not call:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Call not found",
        )
    return call


# ── call lifecycle ─────────────────────────────────────────────────────────────

async def initiate_call(
    db: AsyncSession,
    caller_id: str,
    conversation_id: str,
    call_type: str,
) -> tuple[Call, dict]:
    """Create a Call record with status='initiated'. Caller is added as first participant."""
    if call_type not in ("audio", "video"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="type must be 'audio' or 'video'",
        )

    await _require_conversation_member(db, conversation_id, caller_id)

    call = Call(
        conversation_id=conversation_id,
        initiated_by=caller_id,
        type=call_type,
        status="initiated",
        started_at=datetime.utcnow(),
    )
    db.add(call)
    await db.flush()

    # Fetch all members of the conversation
    members_result = await db.execute(
        select(ConversationMember).where(ConversationMember.conversation_id == conversation_id)
    )
    members = members_result.scalars().all()

    for member in members:
        status_str = "joined" if member.user_id == caller_id else "missed"
        joined_time = datetime.utcnow() if member.user_id == caller_id else None
        
        db.add(
            CallParticipant(
                call_id=call.id,
                user_id=member.user_id,
                joined_at=joined_time,
                status=status_str,
            )
        )
        
    await db.commit()

    return await _load_call(db, call.id), generate_turn_credentials(caller_id)


async def join_call(
    db: AsyncSession,
    call_id: str,
    user_id: str,
) -> tuple[Call, dict]:
    """Add the user as a participant. Transitions status to 'ongoing' on first external join."""
    call = await db.get(Call, call_id)
    if not call:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Call not found",
        )
    if call.status == "ended":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This call has already ended",
        )
    if call.status == "missed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This call was missed",
        )

    await _require_conversation_member(db, call.conversation_id, user_id)

    existing = await db.execute(
        select(CallParticipant).where(
            CallParticipant.call_id == call_id,
            CallParticipant.user_id == user_id,
        )
    )
    participant = existing.scalar_one_or_none()

    if participant is None:
        db.add(
            CallParticipant(
                call_id=call_id,
                user_id=user_id,
                joined_at=datetime.utcnow(),
                status="joined",
            )
        )
    else:
        participant.joined_at = datetime.utcnow()
        participant.left_at = None
        participant.status = "joined"

    if call.status == "initiated":
        call.status = "ongoing"

    await db.commit()

    return await _load_call(db, call_id), generate_turn_credentials(user_id)


async def leave_call(
    db: AsyncSession,
    call_id: str,
    user_id: str,
) -> Call:
    """Mark user as left. Ends the call and calculates duration if no one remains."""
    call = await db.get(Call, call_id)
    if not call:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Call not found",
        )
    if call.status in ("ended", "missed"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Call is already finished",
        )

    result = await db.execute(
        select(CallParticipant).where(
            CallParticipant.call_id == call_id,
            CallParticipant.user_id == user_id,
        )
    )
    participant = result.scalar_one_or_none()
    now = datetime.utcnow()

    rejected = False
    if participant:
        participant.left_at = now
        if participant.status == "missed":
            participant.status = "rejected"
            rejected = True
        else:
            participant.status = "left"

    remaining_joined: int = (
        await db.execute(
            select(func.count(CallParticipant.id)).where(
                CallParticipant.call_id == call_id,
                CallParticipant.status == "joined",
                CallParticipant.user_id != user_id,
            )
        )
    ).scalar_one()

    # Load conversation to check if direct
    await db.refresh(call, ["conversation"])
    is_direct = call.conversation and call.conversation.type == "direct"

    # End the call if no one is left joined, OR if it's a direct call and someone rejected/left
    if remaining_joined == 0 or (is_direct and (rejected or participant.status == "left")):
        call.status = "ended"
        call.ended_at = now
        if call.started_at:
            call.duration_seconds = max(
                0, int((now - call.started_at).total_seconds())
            )

    await db.commit()
    return await _load_call(db, call_id)


async def get_call_history(
    db: AsyncSession,
    user_id: str,
    page: int = 1,
    limit: int = 20,
    call_type: Optional[str] = None,
    call_status: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> tuple[list[Call], int]:
    """Paginated call history for calls the user participated in or initiated."""
    participated_sq = select(CallParticipant.call_id).where(
        CallParticipant.user_id == user_id
    )

    conditions: list = [Call.id.in_(participated_sq)]
    if call_type:
        conditions.append(Call.type == call_type)
    if call_status:
        conditions.append(Call.status == call_status)
    if date_from:
        conditions.append(Call.started_at >= date_from)
    if date_to:
        conditions.append(Call.started_at <= date_to)

    where_clause = and_(*conditions)

    total: int = (
        await db.execute(select(func.count(Call.id)).where(where_clause))
    ).scalar_one()

    rows = (
        await db.execute(
            select(Call)
            .options(
                selectinload(Call.participants).selectinload(CallParticipant.user),
                selectinload(Call.initiator),
                selectinload(Call.conversation).selectinload(Conversation.members).selectinload(ConversationMember.user),
            )
            .where(where_clause)
            .order_by(desc(Call.started_at))
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).scalars().all()

    return list(rows), total


async def admin_get_all_call_history(
    db: AsyncSession,
    page: int = 1,
    limit: int = 20,
    call_type: Optional[str] = None,
    call_status: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> tuple[list[Call], int]:
    """Paginated call history across all users (admin view)."""
    conditions: list = []
    if call_type:
        conditions.append(Call.type == call_type)
    if call_status:
        conditions.append(Call.status == call_status)
    if date_from:
        conditions.append(Call.started_at >= date_from)
    if date_to:
        conditions.append(Call.started_at <= date_to)

    where_clause = and_(*conditions) if conditions else True

    total: int = (
        await db.execute(select(func.count(Call.id)).where(where_clause))
    ).scalar_one()

    rows = (
        await db.execute(
            select(Call)
            .options(
                selectinload(Call.participants).selectinload(CallParticipant.user),
                selectinload(Call.initiator),
                selectinload(Call.conversation).selectinload(Conversation.members).selectinload(ConversationMember.user),
            )
            .where(where_clause)
            .order_by(desc(Call.started_at))
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).scalars().all()

    return list(rows), total


async def invite_to_call(
    db: AsyncSession, call_id: str, inviter_id: str, target_user_id: str
) -> Call:
    """Invite a new user to an ongoing call. Upgrades direct calls to group calls if needed."""
    call = await db.get(Call, call_id)
    if not call:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Call not found",
        )
    if call.status in ("ended", "missed"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Call is already finished",
        )

    # Check if already an active participant
    existing_result = await db.execute(
        select(CallParticipant).where(
            CallParticipant.call_id == call_id,
            CallParticipant.user_id == target_user_id,
        )
    )
    existing_participant = existing_result.scalar_one_or_none()
    if existing_participant:
        if existing_participant.status in ("joined", "invited"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User is already in the call or invited",
            )
        # User previously left/missed — reset their record so they can rejoin
        existing_participant.status = "invited"
        existing_participant.joined_at = None
        existing_participant.left_at = None

    # Load conversation
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.members))
        .where(Conversation.id == call.conversation_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
         raise HTTPException(status_code=404, detail="Conversation not found")

    if conv.type == "direct":
        # Upgrade to group call
        member_ids = [m.user_id for m in conv.members]
        all_ids = list(set(member_ids + [target_user_id]))
        
        # Create new group
        new_conv = Conversation(
            type="group",
            name="Group Call",
            created_by=inviter_id
        )
        db.add(new_conv)
        await db.flush()
        
        for uid in all_ids:
            db.add(ConversationMember(
                conversation_id=new_conv.id,
                user_id=uid,
                role="admin" if uid == inviter_id else "member"
            ))
        
        call.conversation_id = new_conv.id
        await db.flush()
    else:
        # Check if target is already a member of the group
        is_member = any(m.user_id == target_user_id for m in conv.members)
        if not is_member:
            db.add(ConversationMember(
                conversation_id=conv.id,
                user_id=target_user_id,
                role="member"
            ))
            await db.flush()

    # Add as a call participant (only if not already reset above)
    if not existing_participant:
        db.add(CallParticipant(
            call_id=call_id,
            user_id=target_user_id,
            status="invited"
        ))
    
    await db.commit()
    return await _load_call(db, call_id)
