"""Scratch-out erasing in digital grading per account (issue #330)

Revision ID: 0073_grading_scratch_out
Revises: 0072_grading_controls_side
Create Date: 2026-11-20
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0073_grading_scratch_out"
down_revision = "0072_grading_controls_side"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable without a backfill: null reads as on, so every existing account gets the new default.
    op.add_column("teachers", sa.Column("grading_scratch_out", sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column("teachers", "grading_scratch_out")
