"""result delivery (#209): per-account admin switch, off by default

Revision ID: 0052_result_delivery
Revises: 0051_result_shares
Create Date: 2026-11-02
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0052_result_delivery"
down_revision = "0051_result_shares"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("teachers", "allowed_email_domains"):
        op.add_column(
            table,
            sa.Column(
                "allow_result_delivery", sa.Boolean(), nullable=False, server_default=sa.false()
            ),
        )


def downgrade() -> None:
    op.drop_column("allowed_email_domains", "allow_result_delivery")
    op.drop_column("teachers", "allow_result_delivery")
