import logging
import os
import asyncio
from datetime import datetime
from app.utils.timezone import get_now_naive
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from app.config import settings
from app.database import init_db, get_db_context
from app.middleware.rate_limiter import RateLimiterMiddleware
from app.routers import auth, users, admin, conversations, messages, calls, reminders, websocket
from app.utils.jwt import init_redis
from app.models.reminder import Reminder
from app.models.notification import Notification
from app.routers.websocket import manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)

UPLOAD_DIR = "uploads"


async def check_reminders():
    while True:
        try:
            async with get_db_context() as db:
                now = get_now_naive()
                result = await db.execute(
                    select(Reminder).where(
                        Reminder.due_date <= now,
                        Reminder.notified == False,
                        Reminder.is_completed == False
                    )
                )
                due_reminders = result.scalars().all()

                pending: list[tuple[str, Notification]] = []
                for reminder in due_reminders:
                    notification = Notification(
                        user_id=reminder.user_id,
                        type="reminder",
                        title="Reminder Alert",
                        content=f"It's time for: {reminder.title}",
                        data={"reminder_id": reminder.id}
                    )
                    db.add(notification)
                    reminder.notified = True
                    pending.append((reminder.user_id, notification))

                if pending:
                    await db.commit()
                    for user_id, notification in pending:
                        await manager.send_to_user(
                            user_id,
                            "notification:new",
                            {
                                "id": notification.id,
                                "type": "reminder",
                                "title": notification.title,
                                "content": notification.content,
                                "created_at": (
                                    notification.created_at.isoformat()
                                    if notification.created_at
                                    else now.isoformat()
                                ),
                            }
                        )
        except Exception:
            logger.exception("Reminder check failed")

        await asyncio.sleep(30)


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    await init_db()
    await init_redis()
    
    # Start background task
    reminder_task = asyncio.create_task(check_reminders())
    
    yield
    
    # Clean up
    reminder_task.cancel()


app = FastAPI(
    title="OrgChat API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RateLimiterMiddleware, redis_url=settings.REDIS_URL)

app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(conversations.router, prefix="/api")
app.include_router(messages.router, prefix="/api")
app.include_router(calls.router, prefix="/api")
app.include_router(reminders.router, prefix="/api")
app.include_router(websocket.router)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR, check_dir=False), name="uploads")


@app.get("/health", tags=["health"])
async def health_check():
    """Returns service liveness status."""
    return {"status": "ok"}
