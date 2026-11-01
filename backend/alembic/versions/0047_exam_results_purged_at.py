"""Record when retention erased an exam's soft-deleted results for good, so a restore can report them (issue #181)

Revision ID: 0047_exam_results_purged_at
Revises: 0046_exam_mc_correction_hint
Create Date: 2026-11-01
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0047_exam_results_purged_at"
down_revision = "0046_exam_mc_correction_hint"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("exams", sa.Column("results_purged_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("exams", "results_purged_at")
