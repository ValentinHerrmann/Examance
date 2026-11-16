"""Reading time of an exam in whole minutes (issue #265)

Revision ID: 0068_exam_reading
Revises: 0067_exam_duration
Create Date: 2026-11-16
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0068_exam_reading"
down_revision = "0067_exam_duration"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("exams", sa.Column("reading_minutes", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("exams", "reading_minutes")
