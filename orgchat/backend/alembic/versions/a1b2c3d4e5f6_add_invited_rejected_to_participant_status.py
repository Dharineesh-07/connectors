"""add invited and rejected to call_participants status enum

Revision ID: a1b2c3d4e5f6
Revises: 5dcf7164faca
Create Date: 2026-05-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '5dcf7164faca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'call_participants',
        'status',
        existing_type=sa.Enum('joined', 'left', 'missed'),
        type_=sa.Enum('joined', 'left', 'missed', 'invited', 'rejected'),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        'call_participants',
        'status',
        existing_type=sa.Enum('joined', 'left', 'missed', 'invited', 'rejected'),
        type_=sa.Enum('joined', 'left', 'missed'),
        existing_nullable=False,
    )
