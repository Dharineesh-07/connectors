"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-05-09 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users ──────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("display_name", sa.String(100), nullable=True),
        sa.Column("avatar_url", sa.Text, nullable=True),
        sa.Column(
            "role",
            sa.Enum("admin", "employee", name="user_role"),
            nullable=False,
            server_default="employee",
        ),
        sa.Column("department", sa.String(100), nullable=True),
        sa.Column("phone_number", sa.String(20), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("is_online", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("last_seen", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_is_active", "users", ["is_active"])
    op.create_index("ix_users_department", "users", ["department"])

    # ── conversations ──────────────────────────────────────────────────────────
    op.create_table(
        "conversations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "type",
            sa.Enum("direct", "group", name="conversation_type"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=True),
        sa.Column("avatar_url", sa.Text, nullable=True),
        sa.Column(
            "created_by",
            sa.String(36),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )

    # ── conversation_members ───────────────────────────────────────────────────
    op.create_table(
        "conversation_members",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "conversation_id",
            sa.String(36),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "role",
            sa.Enum("admin", "member", name="member_role"),
            nullable=False,
            server_default="member",
        ),
        sa.Column("joined_at", sa.DateTime, nullable=False),
        sa.UniqueConstraint("conversation_id", "user_id", name="uq_conversation_user"),
    )

    # ── messages ───────────────────────────────────────────────────────────────
    op.create_table(
        "messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "conversation_id",
            sa.String(36),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sender_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "type",
            sa.Enum(
                "text", "image", "file", "audio", "video", "call_log",
                name="message_type",
            ),
            nullable=False,
            server_default="text",
        ),
        sa.Column("content", sa.Text, nullable=True),
        sa.Column("file_url", sa.Text, nullable=True),
        sa.Column("file_name", sa.String(255), nullable=True),
        sa.Column("file_size", sa.Integer, nullable=True),
        sa.Column(
            "reply_to_id",
            sa.String(36),
            sa.ForeignKey("messages.id"),
            nullable=True,
        ),
        sa.Column("is_edited", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("is_deleted", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index(
        "ix_messages_conversation_created",
        "messages",
        ["conversation_id", "created_at"],
    )
    op.create_index("ix_messages_sender", "messages", ["sender_id"])

    # ── message_receipts ───────────────────────────────────────────────────────
    op.create_table(
        "message_receipts",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "message_id",
            sa.String(36),
            sa.ForeignKey("messages.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("delivered", "read", name="receipt_status"),
            nullable=False,
        ),
        sa.Column("timestamp", sa.DateTime, nullable=False),
    )
    op.create_index(
        "ix_receipt_message_user", "message_receipts", ["message_id", "user_id"]
    )
    op.create_index("ix_receipt_user", "message_receipts", ["user_id"])

    # ── calls ──────────────────────────────────────────────────────────────────
    op.create_table(
        "calls",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "conversation_id",
            sa.String(36),
            sa.ForeignKey("conversations.id"),
            nullable=False,
        ),
        sa.Column(
            "initiated_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False
        ),
        sa.Column(
            "type", sa.Enum("audio", "video", name="call_type"), nullable=False
        ),
        sa.Column(
            "status",
            sa.Enum("initiated", "ongoing", "ended", "missed", name="call_status"),
            nullable=False,
            server_default="initiated",
        ),
        sa.Column("started_at", sa.DateTime, nullable=False),
        sa.Column("ended_at", sa.DateTime, nullable=True),
        sa.Column("duration_seconds", sa.Integer, nullable=True),
    )
    op.create_index("ix_calls_conversation", "calls", ["conversation_id"])
    op.create_index("ix_calls_initiated_by", "calls", ["initiated_by"])
    op.create_index("ix_calls_status", "calls", ["status"])

    # ── call_participants ──────────────────────────────────────────────────────
    op.create_table(
        "call_participants",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "call_id",
            sa.String(36),
            sa.ForeignKey("calls.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("joined_at", sa.DateTime, nullable=True),
        sa.Column("left_at", sa.DateTime, nullable=True),
        sa.Column(
            "status",
            sa.Enum("joined", "left", "missed", name="participant_status"),
            nullable=False,
            server_default="joined",
        ),
    )
    op.create_index("ix_call_participants_call", "call_participants", ["call_id"])
    op.create_index("ix_call_participants_user", "call_participants", ["user_id"])

    # ── notifications ──────────────────────────────────────────────────────────
    op.create_table(
        "notifications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("content", sa.Text, nullable=True),
        sa.Column("data", sa.JSON, nullable=True),
        sa.Column("is_read", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index(
        "ix_notifications_user_read", "notifications", ["user_id", "is_read"]
    )
    op.create_index("ix_notifications_created_at", "notifications", ["created_at"])

    # ── admin_logs ─────────────────────────────────────────────────────────────
    op.create_table(
        "admin_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("admin_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column(
            "target_user_id",
            sa.String(36),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
        sa.Column("details", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_admin_logs_admin_id", "admin_logs", ["admin_id"])
    op.create_index("ix_admin_logs_created_at", "admin_logs", ["created_at"])
    op.create_index("ix_admin_logs_action", "admin_logs", ["action"])


def downgrade() -> None:
    op.drop_table("admin_logs")
    op.drop_table("notifications")
    op.drop_table("call_participants")
    op.drop_table("calls")
    op.drop_table("message_receipts")
    op.drop_table("messages")
    op.drop_table("conversation_members")
    op.drop_table("conversations")
    op.drop_table("users")

    # Drop MySQL ENUMs (they are named types on some backends)
    with op.get_bind() as conn:
        dialect = conn.dialect.name
        if dialect == "postgresql":
            op.execute("DROP TYPE IF EXISTS user_role")
            op.execute("DROP TYPE IF EXISTS conversation_type")
            op.execute("DROP TYPE IF EXISTS member_role")
            op.execute("DROP TYPE IF EXISTS message_type")
            op.execute("DROP TYPE IF EXISTS receipt_status")
            op.execute("DROP TYPE IF EXISTS call_type")
            op.execute("DROP TYPE IF EXISTS call_status")
            op.execute("DROP TYPE IF EXISTS participant_status")
