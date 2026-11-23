"""Whether a grading review reply answers every objected exercise (issue #280)

Revision ID: 0076_review_reply_complete
Revises: 0075_layout_templates
Create Date: 2026-11-23
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0076_review_reply_complete"
down_revision = "0075_layout_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable without a backfill: null is a reply sent before the flag existed, read as complete.
    op.add_column("result_share_reviews", sa.Column("reply_complete", sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column("result_share_reviews", "reply_complete")
