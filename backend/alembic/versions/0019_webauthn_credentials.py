"""Passkeys as a sign-in factor.

The third of the three factors, alongside the password and the authenticator.
Nothing secret is stored: the public key is public by construction, and
`prf_salt` is the *input* to the authenticator's PRF extension rather than its
output. The derived secret never leaves the browser, which is what lets a passkey
also unwrap the data key without the server being able to.

`supports_prf` records whether the authenticator implements PRF at all. Where it
does not, the passkey authenticates and nothing more — a distinction the UI has
to surface rather than let a teacher assume they are covered.
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
