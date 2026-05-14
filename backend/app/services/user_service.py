from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.models.audit_log import AdminLog
from app.models.call import Call
from app.models.message import Message
from app.models.notification import Notification
from app.models.user import User
from app.utils.jwt import revoke_refresh_token
from app.utils.password import hash_password, validate_password_strength


async def log_admin_action(
    db: AsyncSession,
    admin_id: str,
    action: str,
    target_user_id: Optional[str] = None,
    details: Optional[dict] = None,
) -> None:
    """Append an AdminLog row to the session — caller must commit."""
    db.add(
        AdminLog(
            admin_id=admin_id,
            action=action,
            target_user_id=target_user_id,
            details=details or {},
        )
    )


async def create_user(
    db: AsyncSession,
    admin: User,
    email: str,
    full_name: str,
    department: Optional[str],
    temp_password: str,
    role: str = "employee",
) -> User:
    """Create a new employee; raise 400/409 on domain mismatch or duplicate email."""
    domain = email.rsplit("@", 1)[-1] if "@" in email else ""
    if domain.lower() != settings.COMPANY_EMAIL_DOMAIN.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Email must end with @{settings.COMPANY_EMAIL_DOMAIN}",
        )

    existing = await db.execute(select(User).where(User.email == email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already in use",
        )

    if not validate_password_strength(temp_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Password must be at least 8 characters and include "
                "one uppercase letter, one number, and one special character"
            ),
        )

    user = User(
        email=email.lower(),
        password_hash=hash_password(temp_password),
        full_name=full_name,
        department=department,
        role=role,
        is_active=True,
        created_by=admin.id,
    )
    db.add(user)
    await db.flush()  # populate user.id before logging

    await log_admin_action(
        db,
        admin_id=admin.id,
        action="create_user",
        target_user_id=user.id,
        details={"email": email, "role": role, "department": department},
    )

    await db.commit()
    await db.refresh(user)
    return user


async def list_users(
    db: AsyncSession,
    page: int = 1,
    limit: int = 20,
    search: Optional[str] = None,
    department: Optional[str] = None,
    is_active: Optional[bool] = None,
    role: Optional[str] = None,
) -> tuple[List[User], int]:
    """Return a page of users and the total matching count."""
    conditions = []
    if search:
        pattern = f"%{search}%"
        conditions.append(
            or_(User.full_name.ilike(pattern), User.email.ilike(pattern))
        )
    if department is not None:
        conditions.append(User.department == department)
    if is_active is not None:
        conditions.append(User.is_active == is_active)
    if role is not None:
        conditions.append(User.role == role)

    where_clause = and_(*conditions) if conditions else True

    total: int = (
        await db.execute(select(func.count(User.id)).where(where_clause))
    ).scalar_one()

    rows = (
        await db.execute(
            select(User)
            .where(where_clause)
            .order_by(User.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).scalars().all()

    return list(rows), total


async def update_user(
    db: AsyncSession,
    admin: User,
    user_id: str,
    updates: dict,
) -> User:
    """Update allowed fields on a user; prevent admin from changing own role/status."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user_id == admin.id:
        if "role" in updates and updates["role"] != admin.role:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot change your own role",
            )
        if "is_active" in updates and not updates["is_active"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate your own account",
            )

    allowed = {"full_name", "department", "phone_number", "role", "is_active"}
    changed = {k: v for k, v in updates.items() if k in allowed}
    for field, value in changed.items():
        setattr(user, field, value)

    await log_admin_action(
        db,
        admin_id=admin.id,
        action="update_user",
        target_user_id=user_id,
        details=changed,
    )

    await db.commit()
    await db.refresh(user)
    return user


async def deactivate_user(db: AsyncSession, admin: User, user_id: str) -> None:
    """Soft-delete: set is_active=False and revoke Redis refresh token."""
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account",
        )

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.is_active = False
    user.is_online = False
    await revoke_refresh_token(user.id)

    await log_admin_action(
        db,
        admin_id=admin.id,
        action="deactivate_user",
        target_user_id=user_id,
        details={"email": user.email},
    )

    await db.commit()


async def reset_user_password(
    db: AsyncSession, admin: User, user_id: str, new_password: str
) -> None:
    """Hash new password, revoke refresh token, and log the action."""
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if not validate_password_strength(new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Password must be at least 8 characters and include "
                "one uppercase letter, one number, and one special character"
            ),
        )

    user.password_hash = hash_password(new_password)
    await revoke_refresh_token(user.id)

    await log_admin_action(
        db,
        admin_id=admin.id,
        action="reset_password",
        target_user_id=user_id,
        details={"email": user.email},
    )

    await db.commit()


async def list_audit_logs(
    db: AsyncSession,
    page: int = 1,
    limit: int = 20,
    admin_id: Optional[str] = None,
    action: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> tuple[List[AdminLog], int]:
    """Paginated audit logs with admin + target_user eagerly loaded."""
    conditions = []
    if admin_id:
        conditions.append(AdminLog.admin_id == admin_id)
    if action:
        conditions.append(AdminLog.action == action)
    if date_from:
        conditions.append(AdminLog.created_at >= date_from)
    if date_to:
        conditions.append(AdminLog.created_at <= date_to)

    where_clause = and_(*conditions) if conditions else True

    total: int = (
        await db.execute(select(func.count(AdminLog.id)).where(where_clause))
    ).scalar_one()

    rows = (
        await db.execute(
            select(AdminLog)
            .options(
                selectinload(AdminLog.admin),
                selectinload(AdminLog.target_user),
            )
            .where(where_clause)
            .order_by(AdminLog.created_at.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).scalars().all()

    return list(rows), total


async def get_stats(db: AsyncSession) -> dict:
    """Aggregate dashboard metrics."""
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)

    total_users = (await db.execute(select(func.count(User.id)))).scalar_one()
    active_users = (
        await db.execute(select(func.count(User.id)).where(User.is_active == True))
    ).scalar_one()
    online_users = (
        await db.execute(select(func.count(User.id)).where(User.is_online == True))
    ).scalar_one()
    messages_today = (
        await db.execute(
            select(func.count(Message.id)).where(Message.created_at >= today_start)
        )
    ).scalar_one()
    calls_today = (
        await db.execute(
            select(func.count(Call.id)).where(Call.started_at >= today_start)
        )
    ).scalar_one()
    new_users_this_week = (
        await db.execute(
            select(func.count(User.id)).where(User.created_at >= week_ago)
        )
    ).scalar_one()

    return {
        "total_users": total_users,
        "active_users": active_users,
        "online_users": online_users,
        "messages_today": messages_today,
        "calls_today": calls_today,
        "new_users_this_week": new_users_this_week,
    }
