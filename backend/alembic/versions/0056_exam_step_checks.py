"""Per-exam step checks the teacher ticks by hand (print checklist, MC check; issue #212)

Revision ID: 0056_exam_step_checks
Revises: 0055_result_deliveries
Create Date: 2026-11-04
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0056_exam_step_checks"
down_revision = "0055_result_deliveries"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("exams", sa.Column("step_checks", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("exams", "step_checks")
