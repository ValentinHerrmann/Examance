"""Drawn pages or exact PDF in the exercise editor preview per account (issue #352)

Revision ID: 0078_preview_drawn_pages
Revises: 0077_latex_all_subject_packages
Create Date: 2026-11-28
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0078_preview_drawn_pages"
down_revision = "0077_latex_all_subject_packages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable without a backfill: null reads as drawn pages, so every existing account gets the new default.
    op.add_column("teachers", sa.Column("preview_drawn_pages", sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column("teachers", "preview_drawn_pages")
