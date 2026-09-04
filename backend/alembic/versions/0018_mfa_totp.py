"""Authenticator (TOTP) enrollment and single-use backup codes.

Part of moving login to a two-of-three factor policy: password, passkey and
authenticator, any two of which sign a teacher in. Enrolling all three means
losing any one of them is not a lockout.

The TOTP secret is stored encrypted under a key derived from SECRET_KEY. The
server has to compute the expected code, so this cannot be zero-knowledge; what
it buys is that a database dump on its own yields no working seeds. Rotating
SECRET_KEY therefore invalidates every enrollment.
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0018_mfa_totp"
down_revision: Union[str, None] = "0017_key_envelopes"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.create_table(
        "mfa_credentials",
        sa.Column("teacher_id", sa.Uuid(), nullable=False),
        sa.Column("secret_ct", sa.LargeBinary(), nullable=False),
        sa.Column("secret_iv", sa.LargeBinary(length=12), nullable=False),
        # Null until a correct code has been presented. An unconfirmed row does
        # not count as an enrolled factor.
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        # Highest accepted time step, so a code observed inside its 30-second
        # window cannot be replayed.
        sa.Column("last_used_step", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["teacher_id"], ["teachers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("teacher_id"),
    )

    op.create_table(
        "mfa_backup_codes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("teacher_id", sa.Uuid(), nullable=False),
        # Argon2id, through the same helpers as passwords: these are login
        # credentials.
        sa.Column("code_hash", sa.String(length=255), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["teacher_id"], ["teachers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_mfa_backup_codes_teacher_id"), "mfa_backup_codes", ["teacher_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_mfa_backup_codes_teacher_id"), table_name="mfa_backup_codes")
    op.drop_table("mfa_backup_codes")
    op.drop_table("mfa_credentials")
