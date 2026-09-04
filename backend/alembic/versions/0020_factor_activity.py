"""When each sign-in factor was last used, and when the password last changed.

Passkeys already carried `created_at` / `last_used_at`, so the security page
could say something useful about them and nothing at all about the other two
factors. These columns close that gap.

All nullable with no backfill: NULL means "not recorded since this shipped",
which the UI says outright rather than inventing a date from `created_at`.
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0020_factor_activity"
down_revision: Union[str, None] = "0019_webauthn_credentials"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.add_column(
        "teachers",
        sa.Column("password_changed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "teachers",
        sa.Column("password_last_used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "mfa_credentials",
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("mfa_credentials", "last_used_at")
    op.drop_column("teachers", "password_last_used_at")
    op.drop_column("teachers", "password_changed_at")
