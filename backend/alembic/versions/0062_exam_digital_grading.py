"""Digital grading switch per exam: exams graded outside Examance print no scan aids (issue #228)

Revision ID: 0062_exam_digital_grading
Revises: 0061_exam_booklet_offset
Create Date: 2026-11-06
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0062_exam_digital_grading"
down_revision = "0061_exam_booklet_offset"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("exams", sa.Column("digital_grading", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("exams", sa.Column("results_qr_box", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("exams", "results_qr_box")
    op.drop_column("exams", "digital_grading")
