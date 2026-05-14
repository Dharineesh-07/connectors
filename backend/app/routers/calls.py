from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.call import Call
from app.models.conversation import Conversation
from app.models.user import User
from app.routers.websocket import manager
from app.schemas.call import (
    CallHistoryItem,
    CallInitiate,
    CallInvite,
    CallListResponse,
    CallParticipantInfo,
    CallResponse,
    TURNCredentials,
)
from app.schemas.conversation import ConversationResponse
from app.schemas.user import UserResponse
from app.services import call_service

router = APIRouter(prefix="/calls", tags=["calls"])


def _build_response(call, turn: dict) -> CallResponse:
    return CallResponse(
        call_id=call.id,
        turn_credentials=TURNCredentials(**turn),
    )


def _build_history_item(call) -> CallHistoryItem:
    return CallHistoryItem(
        id=call.id,
        conversation_id=call.conversation_id,
        type=call.type,
        status=call.status,
        started_at=call.started_at,
        ended_at=call.ended_at,
        duration_seconds=call.duration_seconds,
        initiator=UserResponse.model_validate(call.initiator),
        participants=[
            CallParticipantInfo(
                id=p.id,
                user_id=p.user_id,
                joined_at=p.joined_at,
                left_at=p.left_at,
                status=p.status,
                user=UserResponse.model_validate(p.user),
            )
            for p in call.participants
        ],
        conversation=ConversationResponse.model_validate(call.conversation) if call.conversation else None,
    )


@router.post(
    "/initiate",
    response_model=CallResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Initiate an audio or video call",
)
async def initiate_call(
    body: CallInitiate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Creates a Call record (status='initiated') and returns server-generated TURN credentials.
    WebRTC offer/answer/ICE exchange happens over WebSocket — not REST.
    """
    call, turn = await call_service.initiate_call(
        db, current_user.id, body.conversation_id, body.type
    )
    return _build_response(call, turn)


@router.post(
    "/{call_id}/join",
    response_model=CallResponse,
    summary="Join an ongoing or newly initiated call",
)
async def join_call(
    call_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Adds the current user as a CallParticipant (joined_at=now).
    Transitions the call status from 'initiated' → 'ongoing' on first external join.
    Returns fresh TURN credentials.
    """
    call, turn = await call_service.join_call(db, call_id, current_user.id)
    return _build_response(call, turn)


@router.post(
    "/{call_id}/leave",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Leave or end a call",
)
async def leave_call(
    call_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Sets the participant's left_at timestamp.
    If no joined participants remain, the call is marked 'ended', duration is calculated,
    and all other participants are notified via WebSocket.
    """
    call = await call_service.leave_call(db, call_id, current_user.id)

    if call.status == "ended":
        await manager.send_to_conversation(
            call.conversation_id,
            "call:ended",
            {
                "call_id": call_id,
                "ended_by": current_user.id,
                "duration_seconds": call.duration_seconds,
                "timestamp": datetime.utcnow().isoformat(),
            },
        )
    else:
        await manager.send_to_conversation(
            call.conversation_id,
            "call:participant_left",
            {
                "call_id": call_id,
                "user_id": current_user.id,
                "timestamp": datetime.utcnow().isoformat(),
            },
            exclude_user_id=current_user.id,
        )


@router.get(
    "/history",
    response_model=CallListResponse,
    summary="Get paginated call history",
)
async def get_call_history(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    type: Optional[str] = Query(None, description="Filter by call type: audio | video"),
    status: Optional[str] = Query(
        None,
        description="Filter by status: initiated | ongoing | ended | missed",
    ),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns calls the current user participated in, newest first.
    Each item includes full participant list with user info and call duration.
    """
    calls, total = await call_service.get_call_history(
        db,
        user_id=current_user.id,
        page=page,
        limit=limit,
        call_type=type,
        call_status=status,
        date_from=date_from,
        date_to=date_to,
    )
    return CallListResponse(
        calls=[_build_history_item(c) for c in calls],
        total=total,
        page=page,
        limit=limit,
    )


@router.post(
    "/{call_id}/invite",
    response_model=CallHistoryItem,
    summary="Invite a new user to an ongoing call",
)
async def invite_to_call(
    call_id: str,
    body: CallInvite,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Invite a new user to an ongoing call. 
    If the call is in a direct conversation, it upgrades to a group conversation.
    """
    original_conv_id = None
    async with db.begin_nested(): # Use a nested transaction to get the state before service call
        c = await db.get(Call, call_id)
        if c: original_conv_id = c.conversation_id
    
    call = await call_service.invite_to_call(db, call_id, current_user.id, body.user_id)
    
    # Check if upgraded
    upgraded = original_conv_id and original_conv_id != call.conversation_id
    
    # Notify the invited user
    target_user = await db.get(User, body.user_id)
    caller_info = {
        "id": current_user.id,
        "full_name": current_user.full_name,
        "avatar_url": current_user.avatar_url,
    }
    
    if upgraded:
        new_conv = await db.get(Conversation, call.conversation_id)
        conv_data = ConversationResponse.model_validate(new_conv)
        
        # Notify ALL members of the NEW group about the new conversation
        await manager.send_to_conversation(
            call.conversation_id,
            "conversation:new",
            conv_data.model_dump()
        )
        
        # Notify existing participants about the call update
        await manager.send_to_conversation(
            call.conversation_id,
            "call:updated",
            {
                "call_id": call_id,
                "conversation_id": call.conversation_id,
                "timestamp": datetime.utcnow().isoformat(),
            }
        )

    await manager.send_to_user(
        body.user_id,
        "call:incoming",
        {
            "call_id": call.id,
            "caller": caller_info,
            "type": call.type,
            "conversation_id": call.conversation_id,
            "is_invite": True,
            "timestamp": datetime.utcnow().isoformat(),
        }
    )
    
    # Notify existing participants that someone was invited
    await manager.send_to_conversation(
        call.conversation_id,
        "call:participant_invited",
        {
            "call_id": call_id,
            "user_id": body.user_id,
            "user": UserResponse.model_validate(target_user),
            "timestamp": datetime.utcnow().isoformat(),
        },
        exclude_user_id=body.user_id
    )

    return _build_history_item(call)
