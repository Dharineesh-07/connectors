import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Index, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_email", "email"),
        Index("ix_users_is_active", "is_active"),
        Index("ix_users_department", "department"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    display_name = Column(String(100), nullable=True)
    avatar_url = Column(Text, nullable=True)
    role = Column(Enum("admin", "employee"), nullable=False, default="employee")
    department = Column(String(100), nullable=True)
    phone_number = Column(String(20), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    is_online = Column(Boolean, nullable=False, default=False)
    status = Column(Enum("online", "away", "busy", "offline"), nullable=False, default="offline")
    last_seen = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )
    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)

    creator = relationship(
        "User",
        remote_side="User.id",
        foreign_keys="[User.created_by]",
        uselist=False,
    )
    conversation_memberships = relationship(
        "ConversationMember",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    sent_messages = relationship(
        "Message",
        foreign_keys="[Message.sender_id]",
        back_populates="sender",
    )
    notifications = relationship(
        "Notification",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    calls_initiated = relationship(
        "Call",
        foreign_keys="[Call.initiated_by]",
        back_populates="initiator",
    )
    call_participations = relationship(
        "CallParticipant",
        back_populates="user",
    )
    reminders = relationship(
        "Reminder",
        back_populates="user",
        cascade="all, delete-orphan",
    )
