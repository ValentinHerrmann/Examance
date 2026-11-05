"""Print settings per exam: sticker spots and print mode; filler pages independent of page codes (issue #220)

Revision ID: 0059_exam_print_settings
Revises: 0058_exam_print_layout
Create Date: 2026-11-06
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0059_exam_print_settings"
down_revision = "0058_exam_print_layout"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("exams", sa.Column("sticker_spots", sa.String(length=10), nullable=False, server_default="cover"))
    op.add_column("exams", sa.Column("print_mode", sa.String(length=10), nullable=False, server_default="stickers"))
    op.execute("UPDATE exams SET sticker_spots = 'sheet' WHERE sheet_stickers")
    # The mode was a client-owned print-plan choice (issue #212); it now shapes the sheet, so it moves to a column.
    op.execute("UPDATE exams SET print_mode = 'copies' WHERE (step_checks::jsonb -> 'printPlan' ->> 'mode') = 'copies'")
    # Filler pages no longer depend on page codes: exams without page codes keep printing none.
    op.execute("UPDATE exams SET padding_pages = 'none' WHERE NOT page_codes")
    op.alter_column("exams", "padding_pages", server_default="none")
    op.drop_column("exams", "sheet_stickers")


def downgrade() -> None:
    op.add_column("exams", sa.Column("sheet_stickers", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute("UPDATE exams SET sheet_stickers = (sticker_spots <> 'cover')")
    op.execute("UPDATE exams SET padding_pages = 'blank' WHERE padding_pages = 'none'")
    op.alter_column("exams", "padding_pages", server_default="blank")
    op.drop_column("exams", "print_mode")
    op.drop_column("exams", "sticker_spots")
