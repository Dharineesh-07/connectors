import uuid
from datetime import datetime
from app.utils.timezone import get_now_naive

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class Reminder(Base):
    __tablename__ = "reminders"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    due_date = Column(DateTime, nullable=False)
    is_completed = Column(Boolean, nullable=False, default=False)
    notified = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=get_now_naive)

    user = relationship("User", back_populates="reminders")
