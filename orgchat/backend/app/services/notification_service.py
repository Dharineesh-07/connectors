from datetime import datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification


async def create_and_push(
    db: AsyncSession,
    user_id: str,
    notification_type: str,
    title: str,
    content: str,
    data: Optional[dict] = None,
) -> None:
    """Persist a Notification row and immediately push it via WebSocket if the user is connected."""
    notif = Notification(
        user_id=user_id,
        type=notification_type,
        title=title,
        content=content,
        data=data or {},
    )
    db.add(notif)
    await db.commit()

    from app.routers.websocket import manager

    await manager.send_to_user(
        user_id,
        "notification:push",
        {
            "id": notif.id,
            "type": notification_type,
            "title": title,
            "content": content,
            "data": data or {},
            "timestamp": datetime.utcnow().isoformat(),
        },
    )
