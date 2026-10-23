"""maintenance mode (#130): the announced maintenance/deployment window and its audit actions

Revision ID: 0039_maintenance_mode
Revises: 0038_scan_blob_storage
Create Date: 2026-10-23
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0039_maintenance_mode"
down_revision = "0038_scan_blob_storage"
branch_labels = None
depends_on = None

_NEW_ACTIONS = ("MAINTENANCE_STARTED", "MAINTENANCE_ENDED")


def upgrade() -> None:
    op.create_table(
        "maintenance_window",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("downtime_class", sa.String(length=16), nullable=False),
        sa.Column("first_warning_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("second_warning_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("frozen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("auto_end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_by_teacher_id", sa.Uuid(), nullable=True),
        sa.Column("backup_wanted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("backup_state", sa.String(length=16), nullable=True),
        sa.Column("backup_file", sa.String(length=255), nullable=True),
        sa.Column("backup_finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("offsite_state", sa.String(length=16), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["started_by_teacher_id"], ["teachers.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    if op.get_bind().dialect.name != "postgresql":
        return
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
    with op.get_context().autocommit_block():
        for action in _NEW_ACTIONS:
            op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{action}'")


def downgrade() -> None:
    op.drop_table("maintenance_window")
    # Postgres cannot drop enum members; the maintenance actions stay, inert.
