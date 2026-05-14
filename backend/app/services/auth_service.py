import logging
from datetime import datetime, timedelta
import random
import string

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User
from app.models.password_reset import PasswordResetOTP
from app.utils.timezone import get_now_naive
from app.utils.jwt import (
    create_access_token,
    create_refresh_token,
    decode_token,
    revoke_refresh_token,
    store_refresh_token,
    validate_refresh_token,
)
from app.utils.password import hash_password, validate_password_strength, verify_password

logger = logging.getLogger(__name__)


def _validate_email_domain(email: str) -> None:
    """Raise 401 if the email domain does not match the configured company domain."""
    parts = email.rsplit("@", 1)
    if len(parts) != 2 or parts[1].lower() != settings.COMPANY_EMAIL_DOMAIN.lower():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email domain not permitted",
        )


async def _fetch_active_user_by_email(db: AsyncSession, email: str) -> User:
    result = await db.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()
    if not user:
        logger.warning("Failed login attempt for unknown email: %s", email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not user.is_active:
        logger.warning("Login attempt for deactivated account: %s", email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is deactivated",
        )
    return user


async def login(
    db: AsyncSession, email: str, password: str
) -> tuple[str, str, User]:
    """Validate credentials and return (access_token, refresh_token, user)."""
    _validate_email_domain(email)
    user = await _fetch_active_user_by_email(db, email)

    if not verify_password(password, user.password_hash):
        logger.warning("Failed login attempt (bad password) for: %s", email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    user.is_online = True
    user.last_seen = datetime.utcnow()
    await db.commit()
    await db.refresh(user)

    token_data = {"sub": user.id}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    await store_refresh_token(user.id, refresh_token)

    return access_token, refresh_token, user


async def refresh_access_token(db: AsyncSession, refresh_token: str) -> str:
    """Validate refresh token from Redis and issue a new access token."""
    payload = decode_token(refresh_token)

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    user_id: str = payload.get("sub", "")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    if not await validate_refresh_token(user_id, refresh_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token not recognised or already revoked",
        )

    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated",
        )

    return create_access_token({"sub": user_id})


async def logout(db: AsyncSession, user: User) -> None:
    """Revoke refresh token from Redis and mark the user offline."""
    await revoke_refresh_token(user.id)
    user.is_online = False
    user.last_seen = datetime.utcnow()
    await db.commit()


async def change_password(
    db: AsyncSession,
    user: User,
    current_password: str,
    new_password: str,
) -> None:
    """Verify current password, validate new password strength, then update hash."""
    if not verify_password(current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    if not validate_password_strength(new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "New password must be at least 8 characters and include "
                "one uppercase letter, one number, and one special character"
            ),
        )

    user.password_hash = hash_password(new_password)
    await db.commit()

async def request_password_reset(db: AsyncSession, email: str) -> None:
    """Generate a 6-digit OTP, store it, and 'send' it to the user's email."""
    # Enforce company domain
    _validate_email_domain(email)

    # Check if user exists
    result = await db.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()
    if not user:
        # Silently fail to prevent email enumeration
        logger.info("Password reset requested for non-existent email: %s", email)
        return

    # Generate 6-digit OTP
    otp = "".join(random.choices(string.digits, k=6))
    expires_at = get_now_naive() + timedelta(minutes=3)

    # Store OTP (overwrite any existing pending OTPs for this email)
    otp_record = PasswordResetOTP(
        email=email.lower(),
        otp=otp,
        expires_at=expires_at
    )
    db.add(otp_record)
    await db.commit()

    # MOCK EMAIL SENDING
    logger.info("------------------------------------------")
    logger.info("PASSWORD RESET OTP FOR %s: %s", email, otp)
    logger.info("EXPIRES AT: %s", expires_at)
    logger.info("------------------------------------------")
    # In a real app, you would call an email service here.


async def reset_password(db: AsyncSession, email: str, otp: str, new_password: str) -> None:
    """Verify OTP and update the user's password."""
    # Enforce company domain
    _validate_email_domain(email)

    # Find the most recent valid OTP
    now = get_now_naive()
    result = await db.execute(
        select(PasswordResetOTP)
        .where(
            PasswordResetOTP.email == email.lower(),
            PasswordResetOTP.otp == otp,
            PasswordResetOTP.expires_at > now
        )
        .order_by(PasswordResetOTP.created_at.desc())
    )
    otp_record = result.scalar_one_or_none()

    if not otp_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired OTP"
        )

    # Verify user exists
    result = await db.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Enforce strength policy
    if not validate_password_strength(new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "New password must be at least 8 characters and include "
                "one uppercase letter, one number, and one special character"
            ),
        )

    # Update password and mark user as offline (to force re-login)
    user.password_hash = hash_password(new_password)
    user.is_online = False
    
    # Delete the used OTP record
    await db.delete(otp_record)
    
    await db.commit()
    logger.info("Password successfully reset for: %s", email)
