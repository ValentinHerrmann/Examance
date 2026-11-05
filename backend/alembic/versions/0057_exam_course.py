"""Printed course override per exam (\\Klasse; issue #212)

Revision ID: 0057_exam_course
Revises: 0056_exam_step_checks
Create Date: 2026-11-05
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0057_exam_course"
down_revision = "0056_exam_step_checks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("exams", sa.Column("course", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("exams", "course")
