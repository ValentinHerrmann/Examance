"""result delivery (#209): per-account admin switch, on by default like the other switches

Revision ID: 0054_result_delivery
Revises: 0053_drop_exam_cut_corner
Create Date: 2026-11-03
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0054_result_delivery"
down_revision = "0053_drop_exam_cut_corner"
branch_labels = None
depends_on = None

_TABLES = ("teachers", "allowed_email_domains")


def _has_column(table: str) -> bool:
    return "allow_result_delivery" in {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    # Idempotent: the preview stack ran this once as "0052_result_delivery" before main's 0052/0053.
    for table in _TABLES:
        if not _has_column(table):
            op.add_column(
                table,
                sa.Column(
                    "allow_result_delivery", sa.Boolean(), nullable=False, server_default=sa.true()
                ),
            )


def downgrade() -> None:
    for table in reversed(_TABLES):
        op.drop_column(table, "allow_result_delivery")
