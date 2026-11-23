"""The account's edited layout templates of the exam Layout step (issue #279)

Revision ID: 0075_layout_templates
Revises: 0074_grading_scratch_out
Create Date: 2026-11-22
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0075_layout_templates"
down_revision = "0074_grading_scratch_out"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable without a backfill: null means every template is the built-in default.
    op.add_column("teachers", sa.Column("layout_templates", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("teachers", "layout_templates")
