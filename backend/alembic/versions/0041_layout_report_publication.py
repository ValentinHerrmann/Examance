"""layout reports (#134): separate, optional consent to publish a report as a GitHub issue

Revision ID: 0041_layout_report_publication
Revises: 0040_layout_reports
Create Date: 2026-10-25
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0041_layout_report_publication"
down_revision = "0040_layout_reports"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # A database that ran the briefly edited 0040 (commit 8d9dcb1) already has the column.
    columns = {c["name"] for c in sa.inspect(op.get_bind()).get_columns("layout_reports")}
    if "allow_publication" in columns:
        return
    # Reports sent before this consent existed are never published.
    op.add_column(
        "layout_reports",
        sa.Column("allow_publication", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("layout_reports", "allow_publication")
