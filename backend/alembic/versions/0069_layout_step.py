"""Layout step (issue #272): drop exam-level LaTeX packages; paper-graded exams keep their name line

Revision ID: 0069_layout_step
Revises: 0068_exam_reading
Create Date: 2026-11-16
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0069_layout_step"
down_revision = "0068_exam_reading"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE exams SET name_line = true WHERE digital_grading = false")
    op.drop_column("exams", "latex_packages")


def downgrade() -> None:
    # The dropped values are gone; the column comes back empty.
    op.add_column("exams", sa.Column("latex_packages", sa.JSON(), nullable=True))
