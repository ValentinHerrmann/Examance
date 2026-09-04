"""Wrapped copies of the client's data-encryption key.

The DEK used to be derived from the login password, so a password reset produced
a different key and silently orphaned every vault. It is now random and stored
here once per factor that may unwrap it — the password, a printable recovery
code, and each PRF-capable passkey.

Nothing in this table lets the server decrypt anything: it holds ciphertext, a
public salt and public KDF parameters. The key-encryption keys are derived in the
browser from material that never leaves it.
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0017_key_envelopes"
down_revision: Union[str, None] = "0016_login_throttle"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.create_table(
        "key_envelopes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("teacher_id", sa.Uuid(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum("password", "recovery", "passkey", name="key_envelope_kind"),
            nullable=False,
        ),
        # Not a foreign key on purpose: the WebAuthn credential table arrives in
        # a later migration, and a dangling reference is harmless — the wrap is
        # simply unusable.
        sa.Column("credential_id", sa.LargeBinary(), nullable=True),
        sa.Column("kdf", sa.String(length=16), nullable=False),
        sa.Column("kdf_salt", sa.LargeBinary(length=16), nullable=False),
        sa.Column("kdf_params", sa.JSON(), nullable=False),
        sa.Column("wrapped_bundle", sa.LargeBinary(), nullable=False),
        sa.Column("wrap_iv", sa.LargeBinary(length=12), nullable=False),
        sa.Column("key_id", sa.LargeBinary(length=16), nullable=False),
        sa.Column("envelope_version", sa.Integer(), nullable=False),
        sa.Column("invalidated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["teacher_id"], ["teachers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("teacher_id", "kind", "credential_id", name="uq_key_envelope_factor"),
    )
    op.create_index(
        op.f("ix_key_envelopes_teacher_id"), "key_envelopes", ["teacher_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_key_envelopes_teacher_id"), table_name="key_envelopes")
    op.drop_table("key_envelopes")
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("DROP TYPE IF EXISTS key_envelope_kind")
