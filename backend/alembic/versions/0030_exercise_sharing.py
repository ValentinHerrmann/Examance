"""exercise sharing (#65): is_public reset to false (fail closed), copy provenance without FKs

Revision ID: 0030_exercise_sharing
Revises: 0029_account_deletion_requests
Create Date: 2026-10-06
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0030_exercise_sharing"
down_revision = "0029_account_deletion_requests"
branch_labels = None
depends_on = None

_NEW_ACTIONS = ("EXERCISE_SHARING_CHANGED", "EXERCISE_COPIED", "EXERCISE_RESYNCED")


def upgrade() -> None:
    op.execute("UPDATE exercises SET is_public = false WHERE is_public")
    op.add_column("exercises", sa.Column("shared_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("exercises", sa.Column("copied_from_exercise_id", sa.Uuid(), nullable=True))
    op.add_column(
        "exercises", sa.Column("synced_fingerprint", sa.String(length=64), nullable=True)
    )
    op.create_index(
        "ix_exercises_shared",
        "exercises",
        ["is_public"],
        postgresql_where=sa.text("is_public"),
        sqlite_where=sa.text("is_public"),
    )
    op.add_column("exercise_groups", sa.Column("source_group_id", sa.Uuid(), nullable=True))
    op.create_index(
        "ix_exercise_groups_source_group_id", "exercise_groups", ["source_group_id"]
    )
    op.add_column(
        "exercise_resources", sa.Column("content_sha256", sa.String(length=64), nullable=True)
    )
    op.add_column(
        "teachers",
        sa.Column("allow_exercise_sharing", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "allowed_email_domains",
        sa.Column("allow_exercise_sharing", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    if op.get_bind().dialect.name != "postgresql":
        return
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
    with op.get_context().autocommit_block():
        for action in _NEW_ACTIONS:
            op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{action}'")


def downgrade() -> None:
    op.drop_column("allowed_email_domains", "allow_exercise_sharing")
    op.drop_column("teachers", "allow_exercise_sharing")
    op.drop_column("exercise_resources", "content_sha256")
    op.drop_index("ix_exercise_groups_source_group_id", table_name="exercise_groups")
    op.drop_column("exercise_groups", "source_group_id")
    op.drop_index("ix_exercises_shared", table_name="exercises")
    op.drop_column("exercises", "synced_fingerprint")
    op.drop_column("exercises", "copied_from_exercise_id")
    op.drop_column("exercises", "shared_at")
    # Postgres cannot drop enum members; the added audit actions stay, inert.
