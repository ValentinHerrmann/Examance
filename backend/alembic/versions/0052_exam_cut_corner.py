"""Optional cut-off corner tab on page 1 for printed student QR codes (issue #211)

Revision ID: 0052_exam_cut_corner
Revises: 0051_result_shares
Create Date: 2026-11-02
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0052_exam_cut_corner"
down_revision = "0051_result_shares"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "exams",
        sa.Column("cut_corner", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("exams", "cut_corner")
