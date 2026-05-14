import uuid
from datetime import datetime
from app.utils.timezone import get_now_naive

from sqlalchemy import Column, DateTime, ForeignKey, Index, JSON, String
from sqlalchemy.orm import relationship

from app.database import Base


class AdminLog(Base):
    __tablename__ = "admin_logs"
    __table_args__ = (
        Index("ix_admin_logs_admin_id", "admin_id"),
        Index("ix_admin_logs_created_at", "created_at"),
        Index("ix_admin_logs_action", "action"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    admin_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    action = Column(String(100), nullable=False)
    target_user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, default=get_now_naive)

    admin = relationship("User", foreign_keys=[admin_id])
    target_user = relationship("User", foreign_keys=[target_user_id])
