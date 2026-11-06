"""Extra paper per exam: writing-paper style and extra pages; filler pages follow the print layout, so padding_pages goes (issue #228)

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
    # The rest-of-page area now draws in the exam's paper; exams that use it keep their squares.
    # A None stored through the ORM's JSON type is JSON null, not SQL NULL.
    op.execute("UPDATE exams SET paper_style = 'squared' WHERE extra_notes IS NOT NULL AND CAST(extra_notes AS TEXT) <> 'null'")
    # Every exam now fills up to whole sheets for its print layout; filler pages are extra pages.
    op.drop_column("exams", "padding_pages")


def downgrade() -> None:
    op.add_column("exams", sa.Column("padding_pages", sa.String(length=10), nullable=False, server_default="none"))
    op.drop_column("exams", "extra_pages")
    op.drop_column("exams", "paper_style")
