"""Manual page breaks between the exercises of an exam (plaintext layout metadata)

Revision ID: 0036_exam_page_breaks
Revises: 0035_latex_packages
Create Date: 2026-10-19
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0036_exam_page_breaks"
down_revision = "0035_latex_packages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("exams", sa.Column("page_breaks", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("exams", "page_breaks")
