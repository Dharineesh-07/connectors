"""
Seed script — creates:
  - 1 admin user
  - 3 employee users
  - A "Company Announcements" group conversation with all 4 members
  - A welcome message from the admin

Usage:
    cd orgchat/backend
    python seed.py
"""
import asyncio
import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.utils.password import hash_password
import app.models  # noqa: F401 — registers ORM classes

USERS = [
    {
        "id": str(uuid.uuid4()),
        "email": f"admin@{settings.COMPANY_EMAIL_DOMAIN}",
        "password": "Admin@123",
        "full_name": "System Administrator",
        "display_name": "Admin",
        "role": "admin",
        "department": "IT",
    },
    {
        "id": str(uuid.uuid4()),
        "email": f"alice@{settings.COMPANY_EMAIL_DOMAIN}",
        "password": "Alice@123",
        "full_name": "Alice Johnson",
        "display_name": "Alice",
        "role": "employee",
        "department": "Engineering",
    },
    {
        "id": str(uuid.uuid4()),
        "email": f"bob@{settings.COMPANY_EMAIL_DOMAIN}",
        "password": "Bob@1234",
        "full_name": "Bob Smith",
        "display_name": "Bob",
        "role": "employee",
        "department": "Design",
    },
    {
        "id": str(uuid.uuid4()),
        "email": f"carol@{settings.COMPANY_EMAIL_DOMAIN}",
        "password": "Carol@123",
        "full_name": "Carol Williams",
        "display_name": "Carol",
        "role": "employee",
        "department": "Marketing",
    },
]


async def seed() -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with factory() as session:
        from app.models.user import User
        from app.models.conversation import Conversation, ConversationMember
        from app.models.message import Message

        now = datetime.utcnow()
        admin_data = USERS[0]

        # ── Create users ───────────────────────────────────────────────────────
        db_users = []
        for u in USERS:
            user = User(
                id=u["id"],
                email=u["email"],
                password_hash=hash_password(u["password"]),
                full_name=u["full_name"],
                display_name=u["display_name"],
                role=u["role"],
                department=u["department"],
                is_active=True,
                is_online=False,
                created_at=now,
                updated_at=now,
                created_by=admin_data["id"] if u["role"] == "employee" else None,
            )
            session.add(user)
            db_users.append(user)

        await session.flush()

        # ── Create group conversation ──────────────────────────────────────────
        conv_id = str(uuid.uuid4())
        conv = Conversation(
            id=conv_id,
            type="group",
            name="Company Announcements",
            created_by=admin_data["id"],
            created_at=now,
        )
        session.add(conv)
        await session.flush()

        # Add all users as members; admin gets role="admin"
        for u in USERS:
            member = ConversationMember(
                id=str(uuid.uuid4()),
                conversation_id=conv_id,
                user_id=u["id"],
                role="admin" if u["role"] == "admin" else "member",
                joined_at=now,
            )
            session.add(member)

        # ── Welcome message from admin ─────────────────────────────────────────
        msg = Message(
            id=str(uuid.uuid4()),
            conversation_id=conv_id,
            sender_id=admin_data["id"],
            type="text",
            content=(
                "Welcome to OrgChat! This channel is for company-wide announcements. "
                "Feel free to reach out to any team member directly."
            ),
            is_edited=False,
            is_deleted=False,
            created_at=now,
            updated_at=now,
        )
        session.add(msg)

        await session.commit()

    await engine.dispose()

    print("Seed complete.")
    print()
    for u in USERS:
        print(f"  [{u['role']:8s}] {u['email']}  /  password: {u['password']}")
    print()
    print(f"  Group conversation: Company Announcements ({conv_id})")


if __name__ == "__main__":
    asyncio.run(seed())
