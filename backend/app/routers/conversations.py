from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.routers.websocket import manager
from app.schemas.conversation import (
    AddMembersRequest,
    ConversationCreate,
    ConversationListItem,
    ConversationResponse,
    ConversationUpdate,
    LastMessagePreview,
    MemberInfo,
)
from app.schemas.user import UserResponse
from app.services import message_service

router = APIRouter(prefix="/conversations", tags=["conversations"])


def _build_list_item(conv, last_msg, unread_count) -> ConversationListItem:
    members = [MemberInfo.model_validate(m) for m in conv.members[:5]]
    last = (
        LastMessagePreview(
            id=last_msg.id,
            type=last_msg.type,
            content=last_msg.content,
            sender_id=last_msg.sender_id,
            created_at=last_msg.created_at,
        )
        if last_msg
        else None
    )
    return ConversationListItem(
        id=conv.id,
        type=conv.type,
        name=conv.name,
        avatar_url=conv.avatar_url,
        created_at=conv.created_at,
        members=members,
        last_message=last,
        unread_count=unread_count,
    )


@router.get(
    "",
    response_model=List[ConversationListItem],
    summary="List all conversations for the current user",
)
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns conversations sorted by last message time, with unread counts."""
    rows = await message_service.get_user_conversations(db, current_user.id)
    return [_build_list_item(conv, last_msg, unread) for conv, last_msg, unread in rows]


@router.post(
    "",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a direct or group conversation",
)
async def create_conversation(
    body: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """For direct: returns existing DM if one already exists. For group: requires name and ≥2 other members."""
    conv = await message_service.create_conversation(
        db,
        user_id=current_user.id,
        conv_type=body.type,
        user_ids=body.user_ids,
        name=body.name,
        avatar_url=body.avatar_url,
    )

    await manager.send_to_conversation(
        conv.id,
        "conversation:created",
        {
            "conversation_id": conv.id,
            "type": conv.type,
            "name": conv.name,
            "timestamp": datetime.utcnow().isoformat(),
        },
        exclude_user_id=current_user.id,
    )

    return ConversationResponse(
        id=conv.id,
        type=conv.type,
        name=conv.name,
        avatar_url=conv.avatar_url,
        created_at=conv.created_at,
        members=[MemberInfo.model_validate(m) for m in conv.members],
    )


@router.get(
    "/{conversation_id}",
    response_model=ConversationResponse,
    summary="Get conversation details and member list",
)
async def get_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns the conversation with all members and their online status."""
    conv = await message_service.get_conversation(db, conversation_id, current_user.id)
    return ConversationResponse(
        id=conv.id,
        type=conv.type,
        name=conv.name,
        avatar_url=conv.avatar_url,
        created_at=conv.created_at,
        members=[MemberInfo.model_validate(m) for m in conv.members],
    )


@router.put(
    "/{conversation_id}",
    response_model=ConversationResponse,
    summary="Update group conversation name or avatar",
)
async def update_conversation(
    conversation_id: str,
    body: ConversationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Group admin only. Updates name and/or avatar_url."""
    conv = await message_service.update_conversation(
        db, conversation_id, current_user.id, body.model_dump(exclude_none=True)
    )

    await manager.send_to_conversation(
        conversation_id,
        "conversation:updated",
        {
            "conversation_id": conversation_id,
            "name": conv.name,
            "avatar_url": conv.avatar_url,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )

    return ConversationResponse(
        id=conv.id,
        type=conv.type,
        name=conv.name,
        avatar_url=conv.avatar_url,
        created_at=conv.created_at,
        members=[MemberInfo.model_validate(m) for m in conv.members],
    )


@router.post(
    "/{conversation_id}/members",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Add members to a group conversation",
)
async def add_members(
    conversation_id: str,
    body: AddMembersRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Group admin only. Silently skips users already in the group."""
    await message_service.add_members(
        db, conversation_id, current_user.id, body.user_ids
    )

    await manager.send_to_conversation(
        conversation_id,
        "conversation:members_added",
        {
            "conversation_id": conversation_id,
            "added_by": current_user.id,
            "user_ids": body.user_ids,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )


@router.post(
    "/{conversation_id}/join",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Join a group conversation via invite link",
)
async def join_conversation(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Any authenticated user can join a group via an invite link."""
    await message_service.join_conversation(db, conversation_id, current_user.id)

    await manager.send_to_conversation(
        conversation_id,
        "conversation:members_added",
        {
            "conversation_id": conversation_id,
            "added_by": current_user.id,
            "user_ids": [current_user.id],
            "timestamp": datetime.utcnow().isoformat(),
        },
    )


@router.delete(
    "/{conversation_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a member or leave the conversation",
)
async def remove_member(
    conversation_id: str,
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Group admin can remove anyone. Regular members can only remove themselves (leave)."""
    await message_service.remove_member(
        db, conversation_id, current_user.id, user_id
    )

    removal_payload = {
        "conversation_id": conversation_id,
        "removed_by": current_user.id,
        "user_id": user_id,
        "timestamp": datetime.utcnow().isoformat(),
    }
    # Notify remaining members
    await manager.send_to_conversation(conversation_id, "conversation:member_removed", removal_payload)
    # Notify the removed user directly (they are no longer in ConversationMember so send_to_conversation misses them)
    await manager.send_to_user(user_id, "conversation:member_removed", removal_payload)
