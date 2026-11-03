"""Drop exams.cut_corner: the cut-off corner is now the only exam layout (issue #211)

Revision ID: 0053_drop_exam_cut_corner
Revises: 0052_exam_cut_corner
Create Date: 2026-11-03
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0053_drop_exam_cut_corner"
down_revision = "0052_exam_cut_corner"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 0052 stays: the preview stack may already have applied it.
    op.drop_column("exams", "cut_corner")


def downgrade() -> None:
    op.add_column(
        "exams",
        sa.Column("cut_corner", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
