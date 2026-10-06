"""account deletion requests

Mailed single-use link confirms self-deletion: one open request per account (hashed token, TTL)
storing whether the library exercises are kept ownerless. Adds audit action DELETION_REQUESTED.

Revision ID: 0029_account_deletion_requests
Revises: 0028_account_registration
Create Date: 2026-10-06
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0029_account_deletion_requests"
down_revision = "0028_account_registration"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "account_deletion_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("teacher_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("keep_exercises", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["teacher_id"], ["teachers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_account_deletion_requests_teacher_id",
        "account_deletion_requests",
        ["teacher_id"],
        unique=True,
    )
    op.create_index(
        "ix_account_deletion_requests_token_hash",
        "account_deletion_requests",
        ["token_hash"],
        unique=True,
    )

    if op.get_bind().dialect.name != "postgresql":
        return
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'DELETION_REQUESTED'")


def downgrade() -> None:
    op.drop_index(
        "ix_account_deletion_requests_token_hash", table_name="account_deletion_requests"
    )
    op.drop_index(
        "ix_account_deletion_requests_teacher_id", table_name="account_deletion_requests"
    )
    op.drop_table("account_deletion_requests")
    # Postgres cannot drop enum members; DELETION_REQUESTED stays, inert.
