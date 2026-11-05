"""Multi-sheet print layout per exam (page codes, duplex/booklet, padding, sticker box per sheet; issue #220)

Revision ID: 0058_exam_print_layout
Revises: 0057_exam_course
Create Date: 2026-11-05
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0058_exam_print_layout"
down_revision = "0057_exam_course"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing exams keep the old layout (no page codes), so their printed sheets and OMR templates stay valid.
    op.add_column("exams", sa.Column("page_codes", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("exams", sa.Column("print_layout", sa.String(length=10), nullable=False, server_default="duplex"))
    op.add_column("exams", sa.Column("padding_pages", sa.String(length=10), nullable=False, server_default="blank"))
    op.add_column("exams", sa.Column("sheet_stickers", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("exams", "sheet_stickers")
    op.drop_column("exams", "padding_pages")
    op.drop_column("exams", "print_layout")
    op.drop_column("exams", "page_codes")
