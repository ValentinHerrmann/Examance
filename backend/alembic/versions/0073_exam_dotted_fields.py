"""Squared answer fields as a dot grid per exam (issue #314)

Revision ID: 0073_exam_dotted_fields
Revises: 0072_grading_controls_side
Create Date: 2026-11-20
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0073_exam_dotted_fields"
down_revision = "0072_grading_controls_side"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("exams", sa.Column("dotted_fields", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("exams", "dotted_fields")
