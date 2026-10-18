"""LaTeX packages (#108): account list and per-exam override, both plaintext JSON

Revision ID: 0035_latex_packages
Revises: 0034_deleted_exam_retention
Create Date: 2026-10-18
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0035_latex_packages"
down_revision = "0034_deleted_exam_retention"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("teachers", sa.Column("latex_packages", sa.JSON(), nullable=True))
    op.add_column("exams", sa.Column("latex_packages", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("exams", "latex_packages")
    op.drop_column("teachers", "latex_packages")
