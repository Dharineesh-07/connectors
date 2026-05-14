from datetime import datetime
from app.utils.timezone import get_now_naive
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import and_, desc, func, select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.conversation import Conversation, ConversationMember
from app.models.message import Message, MessageReceipt
from app.models.user import User


# ── private helpers ────────────────────────────────────────────────────────────

async def _require_member(
    db: AsyncSession, conversation_id: str, user_id: str
) -> ConversationMember:
    result = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this conversation",
        )
    return member


async def _load_conversation(db: AsyncSession, conversation_id: str) -> Conversation:
    result = await db.execute(
        select(Conversation)
        .options(
            selectinload(Conversation.members).selectinload(ConversationMember.user)
        )
        .where(Conversation.id == conversation_id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )
    return conv


async def _load_message(db: AsyncSession, message_id: str) -> Message:
    result = await db.execute(
        select(Message)
        .options(
            selectinload(Message.sender),
            selectinload(Message.reply_to).selectinload(Message.sender),
            selectinload(Message.receipts),
        )
        .where(Message.id == message_id)
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Message not found",
        )
    return msg


# ── conversation operations ────────────────────────────────────────────────────

async def get_user_conversations(
    db: AsyncSession, user_id: str
) -> list[tuple[Conversation, Optional[Message], int]]:
    """Return (conversation, last_message, unread_count) tuples sorted by recency."""
    conv_ids_sq = select(ConversationMember.conversation_id).where(
        ConversationMember.user_id == user_id
    )

    conv_result = await db.execute(
        select(Conversation)
        .options(
            selectinload(Conversation.members).selectinload(ConversationMember.user)
        )
        .where(Conversation.id.in_(conv_ids_sq))
    )
    conversations = list(conv_result.scalars().all())
    if not conversations:
        return []

    id_list = [c.id for c in conversations]

    # ── last message per conversation (single query) ───────────────────────────
    max_at_sq = (
        select(
            Message.conversation_id,
            func.max(Message.created_at).label("max_at"),
        )
        .where(Message.conversation_id.in_(id_list))
        .group_by(Message.conversation_id)
        .subquery()
    )
    last_result = await db.execute(
        select(Message).join(
            max_at_sq,
            and_(
                Message.conversation_id == max_at_sq.c.conversation_id,
                Message.created_at == max_at_sq.c.max_at,
            ),
        )
    )
    last_msgs: dict[str, Message] = {
        m.conversation_id: m for m in last_result.scalars().all()
    }

    # ── unread count per conversation (single query) ───────────────────────────
    read_sq = (
        select(MessageReceipt.message_id)
        .where(
            MessageReceipt.user_id == user_id,
            MessageReceipt.status == "read",
        )
        .subquery()
    )
    unread_result = await db.execute(
        select(Message.conversation_id, func.count(Message.id).label("cnt"))
        .where(
            Message.conversation_id.in_(id_list),
            Message.sender_id != user_id,
            Message.id.not_in(select(read_sq.c.message_id)),
        )
        .group_by(Message.conversation_id)
    )
    unread_map: dict[str, int] = {row[0]: row[1] for row in unread_result}

    rows = [
        (conv, last_msgs.get(conv.id), unread_map.get(conv.id, 0))
        for conv in conversations
    ]
    rows.sort(
        key=lambda t: (t[1].created_at if t[1] else t[0].created_at),
        reverse=True,
    )
    return rows


async def get_conversation(
    db: AsyncSession, conversation_id: str, user_id: str
) -> Conversation:
    await _require_member(db, conversation_id, user_id)
    return await _load_conversation(db, conversation_id)


async def create_conversation(
    db: AsyncSession,
    user_id: str,
    conv_type: str,
    user_ids: List[str],
    name: Optional[str] = None,
    avatar_url: Optional[str] = None,
) -> Conversation:
    if conv_type == "direct":
        if len(user_ids) != 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Direct conversation requires exactly 1 other user",
            )
        # Removed self-DM restriction to allow "Notes to self"
        return await _get_or_create_dm(db, user_id, user_ids[0])

    if conv_type == "group":
        if not name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Group name is required",
            )
        other_ids = list({uid for uid in user_ids if uid != user_id})
        if len(other_ids) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Group requires at least 2 other members",
            )
        return await _create_group(db, user_id, name, other_ids, avatar_url)

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="type must be 'direct' or 'group'",
    )


async def _get_or_create_dm(
    db: AsyncSession, user_id: str, target_id: str
) -> Conversation:
    is_self = user_id == target_id
    
    # Subquery to count members in conversations
    member_count_sq = (
        select(
            ConversationMember.conversation_id, 
            func.count(ConversationMember.user_id).label("cnt")
        )
        .group_by(ConversationMember.conversation_id)
        .subquery()
    )

    sq1 = select(ConversationMember.conversation_id).where(
        ConversationMember.user_id == user_id
    )
    sq2 = select(ConversationMember.conversation_id).where(
        ConversationMember.user_id == target_id
    )
    
    query = (
        select(Conversation)
        .options(
            selectinload(Conversation.members).selectinload(ConversationMember.user)
        )
        .join(member_count_sq, Conversation.id == member_count_sq.c.conversation_id)
        .where(
            Conversation.type == "direct",
            Conversation.id.in_(sq1),
            Conversation.id.in_(sq2),
            member_count_sq.c.cnt == (1 if is_self else 2)
        )
    )
    
    existing = await db.execute(query)
    conv = existing.scalar_one_or_none()
    if conv:
        return conv

    conv = Conversation(type="direct", created_by=user_id)
    db.add(conv)
    await db.flush()
    db.add(ConversationMember(conversation_id=conv.id, user_id=user_id, role="member"))
    if not is_self:
        db.add(ConversationMember(conversation_id=conv.id, user_id=target_id, role="member"))
    await db.commit()
    return await _load_conversation(db, conv.id)


async def _create_group(
    db: AsyncSession,
    user_id: str,
    name: str,
    other_ids: List[str],
    avatar_url: Optional[str],
) -> Conversation:
    conv = Conversation(
        type="group", name=name, avatar_url=avatar_url, created_by=user_id
    )
    db.add(conv)
    await db.flush()
    db.add(ConversationMember(conversation_id=conv.id, user_id=user_id, role="admin"))
    for uid in other_ids:
        db.add(ConversationMember(conversation_id=conv.id, user_id=uid, role="member"))
    await db.commit()
    return await _load_conversation(db, conv.id)


async def update_conversation(
    db: AsyncSession,
    conversation_id: str,
    user_id: str,
    updates: dict,
) -> Conversation:
    member = await _require_member(db, conversation_id, user_id)
    conv = await _load_conversation(db, conversation_id)

    if conv.type != "group":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only group conversations can be updated",
        )
    if member.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only group admins can update this conversation",
        )

    for field in ("name", "avatar_url"):
        if field in updates and updates[field] is not None:
            setattr(conv, field, updates[field])

    await db.commit()
    return await _load_conversation(db, conversation_id)


async def add_members(
    db: AsyncSession,
    conversation_id: str,
    requester_id: str,
    new_user_ids: List[str],
) -> None:
    member = await _require_member(db, conversation_id, requester_id)
    if member.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only group admins can add members",
        )

    existing = {
        row[0]
        for row in (
            await db.execute(
                select(ConversationMember.user_id).where(
                    ConversationMember.conversation_id == conversation_id
                )
            )
        )
    }
    for uid in new_user_ids:
        if uid not in existing:
            db.add(
                ConversationMember(
                    conversation_id=conversation_id, user_id=uid, role="member"
                )
            )
    await db.commit()


async def join_conversation(
    db: AsyncSession,
    conversation_id: str,
    user_id: str,
) -> None:
    conv = await _load_conversation(db, conversation_id)
    if conv.type != "group":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only join group conversations via invite link",
        )
    result = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
        )
    )
    if result.scalar_one_or_none():
        return  # already a member
    db.add(ConversationMember(conversation_id=conversation_id, user_id=user_id, role="member"))
    await db.commit()


async def remove_member(
    db: AsyncSession,
    conversation_id: str,
    requester_id: str,
    target_user_id: str,
) -> None:
    requester = await _require_member(db, conversation_id, requester_id)

    if requester_id != target_user_id and requester.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can remove other members",
        )

    result = await db.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == target_user_id,
        )
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in this conversation",
        )

    await db.delete(target)
    await db.commit()


# ── message operations ─────────────────────────────────────────────────────────

async def get_messages(
    db: AsyncSession,
    conversation_id: str,
    user_id: str,
    before_id: Optional[str] = None,
    limit: int = 50,
) -> tuple[List[Message], bool]:
    """Cursor-based load; marks fetched messages as delivered for current user."""
    await _require_member(db, conversation_id, user_id)

    where = [Message.conversation_id == conversation_id]
    if before_id:
        ref = await db.get(Message, before_id)
        if ref:
            where.append(Message.created_at < ref.created_at)

    result = await db.execute(
        select(Message)
        .options(
            selectinload(Message.sender),
            selectinload(Message.reply_to).selectinload(Message.sender),
            selectinload(Message.receipts),
        )
        .where(and_(*where))
        .order_by(desc(Message.created_at))
        .limit(limit + 1)
    )
    rows = list(result.scalars().all())

    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    # Mark messages as delivered for the current user where no receipt exists yet
    for msg in rows:
        if msg.sender_id != user_id:
            already = any(r.user_id == user_id for r in msg.receipts)
            if not already:
                db.add(
                    MessageReceipt(
                        message_id=msg.id,
                        user_id=user_id,
                        status="delivered",
                    )
                )
    await db.commit()

    return list(reversed(rows)), has_more


async def search_messages(
    db: AsyncSession, conversation_id: str, user_id: str, query: str, limit: int = 50
) -> List[Message]:
    await _require_member(db, conversation_id, user_id)
    if not query:
        return []

    result = await db.execute(
        select(Message)
        .options(
            selectinload(Message.sender),
            selectinload(Message.reply_to).selectinload(Message.sender),
            selectinload(Message.receipts),
        )
        .where(
            Message.conversation_id == conversation_id,
            Message.is_deleted == False,
            Message.content.ilike(f"%{query}%")
        )
        .order_by(desc(Message.created_at))
        .limit(limit)
    )
    return list(result.scalars().all())


_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".avif"}
_VIDEO_EXTS = {".mp4", ".mov", ".webm", ".avi", ".mkv"}


def _file_is_media(msg) -> tuple[bool, str]:
    """Return (is_media, kind) where kind is 'image' or 'video'. Checks type field first, then extension."""
    if msg.type in ("image", "video"):
        return True, msg.type
    if msg.file_name:
        ext = "." + msg.file_name.rsplit(".", 1)[-1].lower() if "." in msg.file_name else ""
        if ext in _IMAGE_EXTS:
            return True, "image"
        if ext in _VIDEO_EXTS:
            return True, "video"
    return False, ""


async def get_conversation_attachments(
    db: AsyncSession, conversation_id: str, user_id: str
) -> dict:
    await _require_member(db, conversation_id, user_id)

    result = await db.execute(
        select(Message)
        .options(selectinload(Message.sender), selectinload(Message.receipts))
        .where(
            Message.conversation_id == conversation_id,
            Message.is_deleted == False,
            or_(
                Message.file_url != None,
                Message.content.ilike("%http://%"),
                Message.content.ilike("%https://%"),
            ),
        )
        .order_by(desc(Message.created_at))
        .limit(500)
    )
    messages = result.scalars().all()

    attachments: dict[str, list] = {"media": [], "files": [], "links": []}

    for msg in messages:
        if msg.file_url:
            is_media, _ = _file_is_media(msg)
            if is_media:
                attachments["media"].append(msg)
            else:
                attachments["files"].append(msg)
        else:
            attachments["links"].append(msg)

    return attachments


async def create_message(
    db: AsyncSession,
    conversation_id: str,
    sender_id: str,
    content: Optional[str],
    msg_type: str,
    reply_to_id: Optional[str] = None,
    file_url: Optional[str] = None,
    file_name: Optional[str] = None,
    file_size: Optional[int] = None,
) -> Message:
    await _require_member(db, conversation_id, sender_id)

    if reply_to_id:
        ref = await db.get(Message, reply_to_id)
        if not ref or ref.conversation_id != conversation_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reply-to message not found in this conversation",
            )

    msg = Message(
        conversation_id=conversation_id,
        sender_id=sender_id,
        type=msg_type,
        content=content,
        reply_to_id=reply_to_id,
        file_url=file_url,
        file_name=file_name,
        file_size=file_size,
    )
    db.add(msg)
    await db.flush()

    members_result = await db.execute(
        select(User).join(ConversationMember, User.id == ConversationMember.user_id).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id != sender_id,
        )
    )
    for target_user in members_result.scalars().all():
        if target_user.is_online:
            db.add(
                MessageReceipt(message_id=msg.id, user_id=target_user.id, status="delivered")
            )

    await db.commit()
    return await _load_message(db, msg.id)


async def mark_all_as_delivered(db: AsyncSession, user_id: str) -> None:
    """Mark all un-delivered messages in user's conversations as delivered."""
    # Find all conversations the user is in
    conv_ids_sq = select(ConversationMember.conversation_id).where(
        ConversationMember.user_id == user_id
    )
    
    # Find messages in those conversations NOT sent by the user
    # that don't have a receipt for this user
    receipt_exists_sq = select(MessageReceipt.message_id).where(
        MessageReceipt.user_id == user_id
    )
    
    messages_to_mark = await db.execute(
        select(Message.id).where(
            Message.conversation_id.in_(conv_ids_sq),
            Message.sender_id != user_id,
            Message.id.not_in(receipt_exists_sq)
        )
    )
    
    for (msg_id,) in messages_to_mark:
        db.add(MessageReceipt(message_id=msg_id, user_id=user_id, status="delivered"))
    
    await db.commit()


async def edit_message(
    db: AsyncSession, message_id: str, user_id: str, content: str
) -> Message:
    msg = await db.get(Message, message_id)
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    if msg.sender_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only edit your own messages")
    if msg.type != "text":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only text messages can be edited")
    if msg.is_deleted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot edit a deleted message")

    msg.content = content
    msg.is_edited = True
    await db.commit()
    return await _load_message(db, message_id)


async def delete_message(
    db: AsyncSession, message_id: str, user_id: str
) -> Message:
    msg = await db.get(Message, message_id)
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    if msg.sender_id != user_id:
        conv_admin = await db.execute(
            select(ConversationMember).where(
                ConversationMember.conversation_id == msg.conversation_id,
                ConversationMember.user_id == user_id,
                ConversationMember.role == "admin",
            )
        )
        if not conv_admin.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only delete your own messages",
            )

    msg.is_deleted = True
    msg.content = "This message was deleted"
    await db.commit()
    return await _load_message(db, message_id)


async def mark_as_read(
    db: AsyncSession, message_id: str, user_id: str
) -> MessageReceipt:
    msg = await db.get(Message, message_id)
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    await _require_member(db, msg.conversation_id, user_id)

    result = await db.execute(
        select(MessageReceipt).where(
            MessageReceipt.message_id == message_id,
            MessageReceipt.user_id == user_id,
        )
    )
    receipt = result.scalar_one_or_none()

    if receipt is None:
        receipt = MessageReceipt(
            message_id=message_id, user_id=user_id, status="read"
        )
        db.add(receipt)
    else:
        receipt.status = "read"
        receipt.timestamp = get_now_naive()

    await db.commit()
    await db.refresh(receipt)
    return receipt


async def mark_conversation_as_read(
    db: AsyncSession, conversation_id: str, user_id: str
) -> List[tuple[str, str, datetime]]:
    """Marks all unread messages in a conversation as read for the given user. 
    Returns a list of (message_id, sender_id, timestamp) for the affected messages."""
    await _require_member(db, conversation_id, user_id)

    # Find messages in this conversation where sender is not user_id
    result = await db.execute(
        select(Message.id, Message.sender_id).where(
            Message.conversation_id == conversation_id,
            Message.sender_id != user_id,
        )
    )
    message_data = result.all()
    if not message_data:
        return []

    msg_ids = [row[0] for row in message_data]
    msg_senders = {row[0]: row[1] for row in message_data}

    # Find existing receipts for this user
    receipts_result = await db.execute(
        select(MessageReceipt).where(
            MessageReceipt.message_id.in_(msg_ids),
            MessageReceipt.user_id == user_id,
        )
    )
    existing_receipts = {r.message_id: r for r in receipts_result.scalars().all()}

    now = get_now_naive()
    affected = []

    for msg_id in msg_ids:
        receipt = existing_receipts.get(msg_id)
        if receipt is None:
            receipt = MessageReceipt(
                message_id=msg_id, user_id=user_id, status="read", timestamp=now
            )
            db.add(receipt)
            affected.append((msg_id, msg_senders[msg_id], now))
        elif receipt.status != "read":
            receipt.status = "read"
            receipt.timestamp = now
            affected.append((msg_id, msg_senders[msg_id], now))

    if affected:
        await db.commit()

    return affected
