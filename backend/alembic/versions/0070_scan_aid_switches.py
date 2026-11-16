"""Scan aids as separate switches (issue #272): cut corner and fold strip, as printed before

Paper-graded exams lose their stored page codes and sticker spots, which never printed.

Revision ID: 0070_scan_aid_switches
Revises: 0069_layout_step
Create Date: 2026-11-16
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0070_scan_aid_switches"
down_revision = "0069_layout_step"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("exams", sa.Column("cut_corner", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("exams", sa.Column("fold_strip", sa.Boolean(), nullable=False, server_default="true"))
    # Paper-graded exams printed no scan aids at all (`ohnescan`); page codes and spots are now switched on their own, so they keep printing the same.
    op.execute(
        "UPDATE exams SET cut_corner = false, fold_strip = false, page_codes = false,"
        " sticker_spots = 'cover' WHERE digital_grading = false"
    )


def downgrade() -> None:
    op.drop_column("exams", "fold_strip")
    op.drop_column("exams", "cut_corner")
