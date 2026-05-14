from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.routers.websocket import manager
from app.schemas.message import (
    FileUploadResponse,
    MessageCreate,
    MessageListResponse,
    MessageResponse,
    MessageUpdate,
    ReceiptInfo,
    ReplyPreview,
    SenderInfo,
)
from app.services import message_service
from app.utils.file_upload import validate_and_upload

router = APIRouter(tags=["messages"])


def _to_response(msg) -> MessageResponse:
    return MessageResponse(
        id=msg.id,
        conversation_id=msg.conversation_id,
        sender_id=msg.sender_id,
        type=msg.type,
        content=msg.content,
        file_url=msg.file_url,
        file_name=msg.file_name,
        file_size=msg.file_size,
        reply_to_id=msg.reply_to_id,
        is_edited=msg.is_edited,
        is_deleted=msg.is_deleted,
        created_at=msg.created_at,
        updated_at=msg.updated_at,
        sender=SenderInfo.model_validate(msg.sender),
        reply_to=(
            ReplyPreview.model_validate(msg.reply_to) if msg.reply_to else None
        ),
        receipts=[ReceiptInfo.model_validate(r) for r in msg.receipts],
    )


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=MessageListResponse,
    summary="Fetch messages with cursor-based pagination",
)
async def get_messages(
    conversation_id: str,
    before_id: Optional[str] = Query(None, description="Load messages older than this message ID"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns up to `limit` messages sorted oldest-first. Marks them delivered for the caller."""
    messages, has_more = await message_service.get_messages(
        db, conversation_id, current_user.id, before_id, limit
    )
    items = [_to_response(m) for m in messages]
    next_cursor = items[0].id if (has_more and items) else None
    return MessageListResponse(messages=items, has_more=has_more, next_cursor=next_cursor)


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Send a message to a conversation",
)
async def send_message(
    conversation_id: str,
    body: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Creates the message, delivery receipts for all members, and broadcasts via WebSocket."""
    msg = await message_service.create_message(
        db,
        conversation_id=conversation_id,
        sender_id=current_user.id,
        content=body.content,
        msg_type=body.type,
        reply_to_id=body.reply_to_id,
        file_url=body.file_url,
        file_name=body.file_name,
        file_size=body.file_size,
    )
    response = _to_response(msg)

    await manager.send_to_conversation(
        conversation_id,
        "message:new",
        {
            **response.model_dump(mode="json"),
            "timestamp": datetime.utcnow().isoformat(),
        },
    )

    return response


@router.put(
    "/messages/{message_id}",
    response_model=MessageResponse,
    summary="Edit a text message",
)
async def edit_message(
    message_id: str,
    body: MessageUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Sender only. Updates content and sets is_edited=True. Broadcasts the change."""
    msg = await message_service.edit_message(
        db, message_id, current_user.id, body.content
    )
    response = _to_response(msg)

    await manager.send_to_conversation(
        msg.conversation_id,
        "message:edited",
        {
            "message_id": message_id,
            "content": body.content,
            "conversation_id": msg.conversation_id,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )

    return response


@router.delete(
    "/messages/{message_id}",
    response_model=MessageResponse,
    summary="Soft-delete a message",
)
async def delete_message(
    message_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Sender or conversation admin only. Sets is_deleted=True and clears content."""
    msg = await message_service.delete_message(db, message_id, current_user.id)
    response = _to_response(msg)

    await manager.send_to_conversation(
        msg.conversation_id,
        "message:deleted",
        {
            "message_id": message_id,
            "conversation_id": msg.conversation_id,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )

    return response


@router.post(
    "/messages/{message_id}/read",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Mark a message as read",
)
async def mark_message_read(
    message_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Updates or creates a MessageReceipt with status='read' and notifies the sender."""
    from sqlalchemy import select as sa_select
    from app.models.message import Message as Msg

    receipt = await message_service.mark_as_read(db, message_id, current_user.id)

    msg_row = await db.execute(sa_select(Msg).where(Msg.id == message_id))
    msg_obj = msg_row.scalar_one_or_none()
    if msg_obj:
        await manager.send_to_user(
            msg_obj.sender_id,
            "message:read_receipt",
            {
                "message_id": message_id,
                "user_id": current_user.id,
                "status": "read",
                "timestamp": receipt.timestamp.isoformat(),
            },
        )


@router.post(
    "/conversations/{conversation_id}/messages/read",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Mark all unread messages in a conversation as read",
)
async def mark_conversation_messages_read(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Marks all unread messages in the conversation as read and notifies senders."""
    affected = await message_service.mark_conversation_as_read(db, conversation_id, current_user.id)
    
    # Notify senders
    for msg_id, sender_id, timestamp in affected:
        await manager.send_to_user(
            sender_id,
            "message:read_receipt",
            {
                "message_id": msg_id,
                "user_id": current_user.id,
                "status": "read",
                "timestamp": timestamp.isoformat(),
            },
        )


@router.post(
    "/messages/upload",
    response_model=FileUploadResponse,
    summary="Upload a file attachment",
)
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Validates MIME type via magic bytes, enforces size limit, uploads to S3 or local /uploads."""
    file_url, file_name, file_size, mime_type = await validate_and_upload(file)
    return FileUploadResponse(
        file_url=file_url,
        file_name=file_name,
        file_size=file_size,
        mime_type=mime_type,
    )


@router.get(
    "/conversations/{conversation_id}/search",
    response_model=List[MessageResponse],
    summary="Search messages in a conversation",
)
async def search_messages(
    conversation_id: str,
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    messages = await message_service.search_messages(db, conversation_id, current_user.id, q)
    return [_to_response(m) for m in messages]


@router.get(
    "/conversations/{conversation_id}/attachments",
    summary="Get images, files, and links from a conversation",
)
async def get_attachments(
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    attachments = await message_service.get_conversation_attachments(db, conversation_id, current_user.id)
    return {
        "media": [_to_response(m) for m in attachments["media"]],
        "files": [_to_response(m) for m in attachments["files"]],
        "links": [_to_response(m) for m in attachments["links"]],
    }
