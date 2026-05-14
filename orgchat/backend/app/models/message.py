import uuid
from datetime import datetime
from app.utils.timezone import get_now_naive

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.database import Base


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        Index("ix_messages_conversation_created", "conversation_id", "created_at"),
        Index("ix_messages_sender", "sender_id"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(
        String(36),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    sender_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    type = Column(
        Enum("text", "image", "file", "audio", "video", "call_log"),
        nullable=False,
        default="text",
    )
    content = Column(Text, nullable=True)
    file_url = Column(Text, nullable=True)
    file_name = Column(String(255), nullable=True)
    file_size = Column(Integer, nullable=True)
    reply_to_id = Column(String(36), ForeignKey("messages.id"), nullable=True)
    is_edited = Column(Boolean, nullable=False, default=False)
    is_deleted = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=get_now_naive)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=get_now_naive,
        onupdate=get_now_naive,
    )

    conversation = relationship("Conversation", back_populates="messages")
    sender = relationship(
        "User",
        foreign_keys="[Message.sender_id]",
        back_populates="sent_messages",
    )
    reply_to = relationship(
        "Message",
        remote_side="Message.id",
        foreign_keys="[Message.reply_to_id]",
        uselist=False,
    )
    receipts = relationship(
        "MessageReceipt",
        back_populates="message",
        cascade="all, delete-orphan",
    )


class MessageReceipt(Base):
    __tablename__ = "message_receipts"
    __table_args__ = (
        Index("ix_receipt_message_user", "message_id", "user_id"),
        Index("ix_receipt_user", "user_id"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    message_id = Column(
        String(36),
        ForeignKey("messages.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    status = Column(Enum("delivered", "read"), nullable=False)
    timestamp = Column(DateTime, nullable=False, default=get_now_naive)

    message = relationship("Message", back_populates="receipts")
    user = relationship("User")
