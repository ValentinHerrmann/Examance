"""maintenance started early by an admin (#149): audit action

Revision ID: 0042_maintenance_started_early
Revises: 0041_layout_report_publication
Create Date: 2026-10-25
"""
from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "0042_maintenance_started_early"
down_revision = "0041_layout_report_publication"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'MAINTENANCE_STARTED_EARLY'")


def downgrade() -> None:
    # Postgres cannot drop an enum value; the unused value is harmless.
    pass
