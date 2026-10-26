"""Optional handwritten name line next to the QR sticker box (issue #127)

Revision ID: 0043_exam_name_line
Revises: 0042_maintenance_started_early
Create Date: 2026-10-25
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0043_exam_name_line"
down_revision = "0042_maintenance_started_early"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "exams",
        sa.Column("name_line", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("exams", "name_line")
