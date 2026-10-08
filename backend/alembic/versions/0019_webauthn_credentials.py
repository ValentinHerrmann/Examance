"""Passkeys as a sign-in factor.

Nothing secret is stored; `prf_salt` is the PRF input, the secret never leaves the browser.
`supports_prf` False means authentication only; the UI must surface that.
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0019_webauthn_credentials"
down_revision: Union[str, None] = "0018_mfa_totp"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.create_table(
        "webauthn_credentials",
        sa.Column("credential_id", sa.LargeBinary(), nullable=False),
        sa.Column("teacher_id", sa.Uuid(), nullable=False),
        sa.Column("public_key", sa.LargeBinary(), nullable=False),
        # A counter that goes backwards is the spec's clone signal. A constant 0
        # means the authenticator does not count at all, which most platform ones
        # do not.
        sa.Column("sign_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("transports", sa.JSON(), nullable=True),
        sa.Column("aaguid", sa.String(length=64), nullable=True),
        sa.Column("prf_salt", sa.LargeBinary(length=32), nullable=False),
        sa.Column(
            "supports_prf", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("nickname", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["teacher_id"], ["teachers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("credential_id"),
    )
    op.create_index(
        op.f("ix_webauthn_credentials_teacher_id"),
        "webauthn_credentials",
        ["teacher_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_webauthn_credentials_teacher_id"), table_name="webauthn_credentials"
    )
    op.drop_table("webauthn_credentials")
