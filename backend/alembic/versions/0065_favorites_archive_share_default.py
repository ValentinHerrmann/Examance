"""Favorites and archive for exams and exercise groups (issue #252), share question after saving (issue #263)

Revision ID: 0065_favorites_share
Revises: 0064_exam_statistics
Create Date: 2026-11-11
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0065_favorites_share"
down_revision = "0064_exam_statistics"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("exams", "exercise_groups"):
        op.add_column(table, sa.Column("is_favorite", sa.Boolean(), server_default=sa.false(), nullable=False))
        op.add_column(table, sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("exercise_groups", sa.Column("share_asked_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("teachers", sa.Column("share_new_exercises", sa.Boolean(), nullable=True))
    if op.get_bind().dialect.name == "postgresql":
        # ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'EXERCISE_SHARE_DEFAULT_CHANGED'")


def downgrade() -> None:
    # The audit enum value stays: Postgres cannot drop enum values.
    op.drop_column("teachers", "share_new_exercises")
    op.drop_column("exercise_groups", "share_asked_at")
    for table in ("exercise_groups", "exams"):
        op.drop_column(table, "archived_at")
        op.drop_column(table, "is_favorite")
