"""duplicate audit actions (#121): own exercises and exams copied as a starting point

Revision ID: 0037_duplicate_audit
Revises: 0036_exam_page_breaks
Create Date: 2026-10-19
"""
from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "0037_duplicate_audit"
down_revision = "0036_exam_page_breaks"
branch_labels = None
depends_on = None

_NEW_ACTIONS = ("EXERCISE_DUPLICATED", "EXAM_DUPLICATED")


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
    with op.get_context().autocommit_block():
        for action in _NEW_ACTIONS:
            op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{action}'")


def downgrade() -> None:
    # Enum values cannot be dropped in Postgres.
    pass
