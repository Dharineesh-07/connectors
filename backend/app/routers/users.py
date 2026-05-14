from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.user import FCMTokenRequest, UserResponse, UserUpdate
from app.services import user_service
from app.utils.jwt import get_redis_client

router = APIRouter(prefix="/users", tags=["users"])


@router.get(
    "",
    response_model=list[UserResponse],
    summary="List active users for the company directory",
)
async def list_directory_users(
    search: Optional[str] = Query(default=None, max_length=80),
    limit: int = Query(default=100, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return active employees for starting direct and group conversations."""
    users, _ = await user_service.list_users(
        db,
        page=1,
        limit=limit,
        search=search,
        is_active=True,
    )
    return [
        UserResponse.model_validate(user)
        for user in users
    ]


@router.post(
    "/fcm-token",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Register device push token",
)
async def register_fcm_token(
    body: FCMTokenRequest,
    current_user: User = Depends(get_current_user),
):
    """Store the device FCM token in Redis keyed by user ID for push notifications."""
    r = get_redis_client()
    await r.set(f"fcm:{current_user.id}", body.token)


@router.put(
    "/me",
    response_model=UserResponse,
    summary="Update own profile",
)
async def update_profile(
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Allow any authenticated user to update their own display_name, avatar_url, phone_number."""
    safe_fields = {"display_name", "phone_number", "avatar_url"}
    for field in safe_fields:
        value = getattr(body, field, None)
        if value is not None:
            setattr(current_user, field, value)
    await db.commit()
    await db.refresh(current_user)
    return UserResponse.model_validate(current_user)
