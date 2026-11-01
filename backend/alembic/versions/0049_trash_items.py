"""Trash: restorable copies of deleted rows, plus their audit actions (issue #125)

Revision ID: 0049_trash_items
Revises: 0048_exam_pseudonym_version
Create Date: 2026-11-01
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0049_trash_items"
down_revision = "0048_exam_pseudonym_version"
branch_labels = None
depends_on = None

_ACTIONS = ("TRASH_CAPTURED", "TRASH_RESTORED", "TRASH_PURGED")


def upgrade() -> None:
    op.create_table(
        "trash_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "teacher_id",
            sa.Uuid(),
            sa.ForeignKey("teachers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("group_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("exam_id", sa.Uuid(), nullable=True),
        sa.Column("label", sa.JSON(), nullable=False),
        sa.Column("payload", sa.LargeBinary(), nullable=False),
        sa.Column("blob_refs", sa.JSON(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("purge_after", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_trash_items_teacher_id", "trash_items", ["teacher_id"])
    op.create_index("ix_trash_items_group_id", "trash_items", ["group_id"])
    op.create_index("ix_trash_items_purge_after", "trash_items", ["purge_after"])
    if op.get_bind().dialect.name != "postgresql":
        return
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
    with op.get_context().autocommit_block():
        for action in _ACTIONS:
            op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{action}'")


def downgrade() -> None:
    op.drop_index("ix_trash_items_purge_after", table_name="trash_items")
    op.drop_index("ix_trash_items_group_id", table_name="trash_items")
    op.drop_index("ix_trash_items_teacher_id", table_name="trash_items")
    op.drop_table("trash_items")
    # Postgres cannot drop an enum value; the unused values are harmless.
