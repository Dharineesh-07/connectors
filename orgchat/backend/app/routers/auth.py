from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    TokenRefreshRequest,
    TokenResponse,
)
from app.schemas.user import UserResponse
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Authenticate and receive tokens",
)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Validate credentials, enforce company email domain, return access + refresh tokens."""
    access_token, refresh_token, user = await auth_service.login(
        db, body.email, body.password
    )
    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user),
    )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Exchange refresh token for a new access token",
)
async def refresh_token(
    body: TokenRefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    """Validate the refresh token stored in Redis and issue a fresh access token."""
    access_token = await auth_service.refresh_access_token(db, body.refresh_token)
    return TokenResponse(access_token=access_token)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke refresh token and go offline",
)
async def logout(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete the refresh token from Redis and mark the user as offline."""
    await auth_service.logout(db, current_user)


@router.post(
    "/change-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change the current user's password",
)
async def change_password(
    body: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Verify current password, enforce strength policy, and update the hash."""
    await auth_service.change_password(
        db, current_user, body.current_password, body.new_password
    )


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Return the authenticated user's profile",
)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the full profile of the currently authenticated user."""
    return UserResponse.model_validate(current_user)

@router.post(
    "/forgot-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Request a password reset OTP",
)
async def forgot_password(
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Generate and send an OTP to the provided email if it exists."""
    await auth_service.request_password_reset(db, body.email)


@router.post(
    "/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Reset password using OTP",
)
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """Verify the OTP and update the user's password."""
    await auth_service.reset_password(db, body.email, body.otp, body.new_password)
