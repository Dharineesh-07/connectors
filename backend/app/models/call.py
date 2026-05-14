import uuid
from datetime import datetime
from app.utils.timezone import get_now_naive

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Index, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class Call(Base):
    __tablename__ = "calls"
    __table_args__ = (
        Index("ix_calls_conversation", "conversation_id"),
        Index("ix_calls_initiated_by", "initiated_by"),
        Index("ix_calls_status", "status"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = Column(
        String(36),
        ForeignKey("conversations.id"),
        nullable=False,
    )
    initiated_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    type = Column(Enum("audio", "video"), nullable=False)
    status = Column(
        Enum("initiated", "ongoing", "ended", "missed"),
        nullable=False,
        default="initiated",
    )
    started_at = Column(DateTime, nullable=False, default=get_now_naive)
    ended_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, nullable=True)

    conversation = relationship("Conversation", back_populates="calls")
    initiator = relationship(
        "User",
        foreign_keys=[initiated_by],
        back_populates="calls_initiated",
    )
    participants = relationship(
        "CallParticipant",
        back_populates="call",
        cascade="all, delete-orphan",
    )


class CallParticipant(Base):
    __tablename__ = "call_participants"
    __table_args__ = (
        Index("ix_call_participants_call", "call_id"),
        Index("ix_call_participants_user", "user_id"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    call_id = Column(
        String(36),
        ForeignKey("calls.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    joined_at = Column(DateTime, nullable=True)
    left_at = Column(DateTime, nullable=True)
    status = Column(
        Enum("joined", "left", "missed", "invited"),
        nullable=False,
        default="joined",
    )

    call = relationship("Call", back_populates="participants")
    user = relationship("User", back_populates="call_participations")
