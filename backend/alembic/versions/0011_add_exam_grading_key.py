"""Add grading_key JSON column to exams.

Revision ID: 0011_add_exam_grading_key
Revises: 0010_split_exam_grade_klasse
Create Date: 2026-08-14 13:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0011_add_exam_grading_key"
down_revision: Union[str, None] = "0010_split_exam_grade_klasse"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("exams", sa.Column("grading_key", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("exams", "grading_key")
