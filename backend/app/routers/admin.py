from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_admin
from app.models.notification import Notification
from app.models.user import User
from app.routers.websocket import manager
from app.schemas.admin import (
    AdminStatsResponse,
    AuditLogListResponse,
    AuditLogResponse,
    AuditUserSnippet,
    BroadcastRequest,
    ResetPasswordRequest,
)
from app.schemas.call import CallHistoryItem, CallListResponse, CallParticipantInfo
from app.schemas.user import UserCreate, UserListResponse, UserResponse, UserUpdate
import string
import secrets
from app.services import call_service, user_service, email_service

def generate_temp_password(length=12):
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    while True:
        password = ''.join(secrets.choice(alphabet) for i in range(length))
        if (any(c.islower() for c in password)
                and any(c.isupper() for c in password)
                and sum(c.isdigit() for c in password) >= 1
                and any(c in "!@#$%^&*" for c in password)):
            return password

router = APIRouter(prefix="/admin", tags=["admin"])


# ── routes ────────────────────────────────────────────────────────────────────

@router.post(
    "/users",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new employee account",
)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Admin-only. Validates email domain, auto-generates password, and sends invite email."""
    temp_pwd = generate_temp_password()
    
    user = await user_service.create_user(
        db,
        admin,
        email=body.email,
        full_name=body.full_name,
        department=body.department,
        temp_password=temp_pwd,
        role=body.role,
    )
    
    # Send the mock invite email with the generated password
    await email_service.send_invite_email(user.email, user.full_name, temp_pwd)
    
    return UserResponse.model_validate(user)


@router.get(
    "/users",
    response_model=UserListResponse,
    summary="List employees with optional filters",
)
async def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, description="Match name or email"),
    department: Optional[str] = None,
    is_active: Optional[bool] = None,
    role: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Admin-only. Returns paginated user list sorted by creation date."""
    users, total = await user_service.list_users(
        db, page, limit, search, department, is_active, role
    )
    return UserListResponse(
        users=[UserResponse.model_validate(u) for u in users],
        total=total,
        page=page,
        limit=limit,
    )


@router.put(
    "/users/{user_id}",
    response_model=UserResponse,
    summary="Update a user's fields",
)
async def update_user(
    user_id: str,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Admin-only. Cannot change own role or deactivate self."""
    user = await user_service.update_user(
        db, admin, user_id, body.model_dump(exclude_none=True)
    )
    return UserResponse.model_validate(user)


@router.delete(
    "/users/{user_id}",
    status_code=status.HTTP_200_OK,
    summary="Soft-deactivate a user",
)
async def deactivate_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Admin-only. Sets is_active=False and revokes all active sessions."""
    await user_service.deactivate_user(db, admin, user_id)
    return {"message": "User deactivated"}


@router.post(
    "/users/{user_id}/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Reset a user's password",
)
async def reset_password(
    user_id: str,
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Admin-only. Hashes the new password and invalidates existing sessions."""
    await user_service.reset_user_password(db, admin, user_id, body.new_password)


@router.get(
    "/audit-logs",
    response_model=AuditLogListResponse,
    summary="Paginated admin audit log",
)
async def get_audit_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    admin_id: Optional[str] = None,
    action: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Admin-only. Returns audit log entries with admin and target user info."""
    logs, total = await user_service.list_audit_logs(
        db, page, limit, admin_id, action, date_from, date_to
    )
    items = [
        AuditLogResponse(
            id=log.id,
            action=log.action,
            details=log.details,
            created_at=log.created_at,
            admin=AuditUserSnippet.model_validate(log.admin),
            target_user=(
                AuditUserSnippet.model_validate(log.target_user)
                if log.target_user
                else None
            ),
        )
        for log in logs
    ]
    return AuditLogListResponse(logs=items, total=total, page=page, limit=limit)


@router.get(
    "/stats",
    response_model=AdminStatsResponse,
    summary="Aggregate dashboard metrics",
)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Admin-only. Returns user counts, message/call counts, and weekly new users."""
    data = await user_service.get_stats(db)
    return AdminStatsResponse(**data)


@router.post(
    "/broadcast",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Send a message to all active users",
)
async def broadcast_message(
    body: BroadcastRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Admin-only. Creates a Notification for every active user and pushes via WebSocket."""
    result = await db.execute(select(User).where(User.is_active == True))
    active_users: List[User] = list(result.scalars().all())

    for user in active_users:
        db.add(
            Notification(
                user_id=user.id,
                type="broadcast",
                title="Admin Broadcast",
                content=body.content,
                data={"sender_id": admin.id, "sender_name": admin.full_name},
            )
        )

    await user_service.log_admin_action(
        db,
        admin_id=admin.id,
        action="broadcast",
        details={"content": body.content, "recipient_count": len(active_users)},
    )

    await db.commit()

    await manager.broadcast(
        "notification:push",
        {
            "type": "broadcast",
            "title": "Admin Broadcast",
            "content": body.content,
            "sender": admin.full_name,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )


from app.schemas.conversation import ConversationResponse

@router.get(
    "/call-history",
    response_model=CallListResponse,
    summary="Get paginated call history for all users (admin)",
)
async def admin_call_history(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    type: Optional[str] = Query(None, description="Filter by call type: audio | video"),
    status: Optional[str] = Query(
        None,
        description="Filter by status: initiated | ongoing | ended | missed",
    ),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Admin-only. Returns all calls across all users, newest first."""
    calls, total = await call_service.admin_get_all_call_history(
        db,
        page=page,
        limit=limit,
        call_type=type,
        call_status=status,
        date_from=date_from,
        date_to=date_to,
    )
    items = [
        CallHistoryItem(
            id=c.id,
            conversation_id=c.conversation_id,
            type=c.type,
            status=c.status,
            started_at=c.started_at,
            ended_at=c.ended_at,
            duration_seconds=c.duration_seconds,
            initiator=UserResponse.model_validate(c.initiator),
            participants=[
                CallParticipantInfo(
                    id=p.id,
                    user_id=p.user_id,
                    joined_at=p.joined_at,
                    left_at=p.left_at,
                    status=p.status,
                    user=UserResponse.model_validate(p.user),
                )
                for p in c.participants
            ],
            conversation=ConversationResponse.model_validate(c.conversation) if c.conversation else None,
        )
        for c in calls
    ]
    return CallListResponse(calls=items, total=total, page=page, limit=limit)
