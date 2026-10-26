"""Optional karo block for extra solutions at the end of an exam (issue #156)

Revision ID: 0044_exam_extra_notes
Revises: 0043_exam_name_line
Create Date: 2026-10-26
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0044_exam_extra_notes"
down_revision = "0043_exam_name_line"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("exams", sa.Column("extra_notes", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("exams", "extra_notes")
