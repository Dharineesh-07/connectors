import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, String
from app.database import Base
from app.utils.timezone import get_now_naive

class PasswordResetOTP(Base):
    __tablename__ = "password_reset_otps"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), nullable=False, index=True)
    otp = Column(String(6), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False, default=get_now_naive)
