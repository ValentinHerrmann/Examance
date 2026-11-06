"""Extra paper per exam: writing-paper style, integrated extra pages, extra-sheet stack (issue #228)

Revision ID: 0060_exam_extra_paper
Revises: 0059_exam_print_settings
Create Date: 2026-11-06
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0060_exam_extra_paper"
down_revision = "0059_exam_print_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The defaults are the old layout, so existing exams compile unchanged.
    op.add_column("exams", sa.Column("paper_style", sa.String(length=10), nullable=False, server_default="empty"))
    op.add_column("exams", sa.Column("extra_pages", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("exams", sa.Column("extra_sheets", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("exams", "extra_sheets")
    op.drop_column("exams", "extra_pages")
    op.drop_column("exams", "paper_style")
