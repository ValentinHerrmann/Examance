"""Booklet print offset per exam: shifts imposed A3 sheets so an off-centre printer prints them centred (issue #228)

Revision ID: 0061_exam_booklet_offset
Revises: 0060_exam_extra_paper
Create Date: 2026-11-06
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0061_exam_booklet_offset"
down_revision = "0060_exam_extra_paper"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("exams", sa.Column("booklet_offset_mm", sa.Float(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("exams", "booklet_offset_mm")
