"""Side of the grading view's controls per account (issue #328)

Revision ID: 0072_grading_controls_side
Revises: 0071_exam_exercise_index
Create Date: 2026-11-20
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0072_grading_controls_side"
down_revision = "0071_exam_exercise_index"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable without a backfill: null reads as left, so every existing account gets the new default.
    op.add_column(
        "teachers", sa.Column("grading_controls_side", sa.String(length=8), nullable=True)
    )
    op.create_check_constraint(
        "ck_teachers_grading_controls_side",
        "teachers",
        "grading_controls_side IS NULL OR grading_controls_side IN ('left', 'right')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_teachers_grading_controls_side", "teachers", type_="check")
    op.drop_column("teachers", "grading_controls_side")
