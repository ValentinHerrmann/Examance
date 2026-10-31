"""Optional legend on MC tasks showing how to withdraw and re-select a cross (issue #192)

Revision ID: 0046_exam_mc_correction_hint
Revises: 0045_drop_exam_is_public
Create Date: 2026-10-31
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0046_exam_mc_correction_hint"
down_revision = "0045_drop_exam_is_public"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "exams",
        sa.Column("mc_correction_hint", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("exams", "mc_correction_hint")
