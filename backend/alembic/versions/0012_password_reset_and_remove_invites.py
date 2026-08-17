"""password reset and remove invites

Revision ID: 0012_pwd_reset_remove_invites
Revises: 0011_add_exam_grading_key
Create Date: 2026-08-17
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0012_pwd_reset_remove_invites"
down_revision = "0011_add_exam_grading_key"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Make teachers.password_hash nullable
    op.alter_column(
        "teachers",
        "password_hash",
        existing_type=sa.String(length=255),
        nullable=True,
    )

    # 2. Create password_reset_tokens table
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("teacher_id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["teacher_id"],
            ["teachers.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_password_reset_tokens_teacher_id"),
        "password_reset_tokens",
        ["teacher_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_password_reset_tokens_token_hash"),
        "password_reset_tokens",
        ["token_hash"],
        unique=True,
    )

    # 3. Drop legacy invite_tokens table if it exists
    op.execute("DROP TABLE IF EXISTS invite_tokens CASCADE")

    # 4. Extend audit_action enum values (PostgreSQL specific)
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'PASSWORD_RESET_REQUESTED'")
        op.execute("ALTER TYPE audit_action ADD VALUE IF NOT EXISTS 'PASSWORD_RESET_COMPLETED'")


def downgrade() -> None:
    op.drop_index(
        op.f("ix_password_reset_tokens_token_hash"),
        table_name="password_reset_tokens",
    )
    op.drop_index(
        op.f("ix_password_reset_tokens_teacher_id"),
        table_name="password_reset_tokens",
    )
    op.drop_table("password_reset_tokens")

    op.alter_column(
        "teachers",
        "password_hash",
        existing_type=sa.String(length=255),
        nullable=False,
    )
