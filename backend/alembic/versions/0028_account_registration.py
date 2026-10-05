"""account registration

Self-registration with e-mail verification and admin approval (issue #53):

- `teachers.approved_at`: null means pending; a pending account holds no token. Every existing
  account was created by an admin, the CLI or the bootstrap, so it is backfilled as approved at
  its creation time. No server default on purpose (fail closed).
- `teachers.registration_note`: the optional note a registrant leaves for the admin.
- `teachers.allow_server_results` / `allow_server_latex`: the per-account feature switches read
  by app/services/capabilities.py. Existing accounts keep everything.
- `registration_requests`: addresses awaiting verification (hashed token, TTL).
- `allowed_email_domains`: domains whose registrations are approved automatically.
- New audit_action members for the above, plus PASSWORD_CHANGED, which /auth/change-password
  has been writing without it ever being a member (Postgres rejects that).

Revision ID: 0028_account_registration
Revises: 0027_teacher_logo_modes
Create Date: 2026-10-05
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0028_account_registration"
down_revision = "0027_teacher_logo_modes"
branch_labels = None
depends_on = None

_NEW_ACTIONS = (
    "USER_REGISTERED",
    "USER_APPROVED",
    "USER_REJECTED",
    "USER_FEATURES_CHANGED",
    "ALLOWED_DOMAIN_ADDED",
    "ALLOWED_DOMAIN_CHANGED",
    "ALLOWED_DOMAIN_REMOVED",
    "PASSWORD_CHANGED",
)


def upgrade() -> None:
    op.add_column("teachers", sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("teachers", sa.Column("registration_note", sa.String(length=500), nullable=True))
    op.add_column(
        "teachers",
        sa.Column("allow_server_results", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "teachers",
        sa.Column("allow_server_latex", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.execute("UPDATE teachers SET approved_at = created_at WHERE approved_at IS NULL")

    op.create_table(
        "registration_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_registration_requests_email", "registration_requests", ["email"], unique=True
    )
    op.create_index(
        "ix_registration_requests_token_hash", "registration_requests", ["token_hash"], unique=True
    )

    op.create_table(
        "allowed_email_domains",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("domain", sa.String(length=253), nullable=False),
        sa.Column("allow_server_results", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("allow_server_latex", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_allowed_email_domains_domain", "allowed_email_domains", ["domain"], unique=True
    )

    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        # SQLite renders the enum as VARCHAR; nothing to alter.
        return

    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
    with op.get_context().autocommit_block():
        for action in _NEW_ACTIONS:
            op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{action}'")


def downgrade() -> None:
    op.drop_index("ix_allowed_email_domains_domain", table_name="allowed_email_domains")
    op.drop_table("allowed_email_domains")
    op.drop_index("ix_registration_requests_token_hash", table_name="registration_requests")
    op.drop_index("ix_registration_requests_email", table_name="registration_requests")
    op.drop_table("registration_requests")
    op.drop_column("teachers", "allow_server_latex")
    op.drop_column("teachers", "allow_server_results")
    op.drop_column("teachers", "registration_note")
    op.drop_column("teachers", "approved_at")
    # Postgres cannot drop enum members; the added audit actions stay, inert.
