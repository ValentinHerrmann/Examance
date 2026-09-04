"""Per-account login cooloff, plus the full audit_action enum.

Adds `teachers.locked_until` — the database-side mirror of the Redis login
cooloff in `app/services/login_throttle.py`, so flushing Redis cannot silently
clear a lock.

Also extends `audit_action`. Two of the new members are not new behaviour:
`admin.py` has been writing CREATE_USER_EMAIL_FAILED and
PASSWORD_RESET_EMAIL_FAILED all along, which Postgres rejects because they were
never enum members. The rest cover the authentication work that follows. They
are all added here, once, so later migrations need no enum surgery.
"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0016_login_throttle"
down_revision: Union[str, None] = "0015_mc_group_link_set_null"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None

_NEW_ACTIONS = (
    "CREATE_USER_EMAIL_FAILED",
    "PASSWORD_RESET_EMAIL_FAILED",
    "LOGIN_FAILED",
    "ACCOUNT_LOCKED",
    "MFA_ENROLLED",
    "MFA_DISABLED",
    "PASSKEY_REGISTERED",
    "PASSKEY_REMOVED",
    "KEY_ENVELOPE_RESET",
    "ORPHANED_DATA_DELETED",
)


def upgrade() -> None:
    op.add_column(
        "teachers",
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
    )

    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        # SQLite (tests) renders the enum as VARCHAR without a usable check
        # constraint to rebuild, so there is nothing to alter.
        return

    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
    with op.get_context().autocommit_block():
        for action in _NEW_ACTIONS:
            op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{action}'")


def downgrade() -> None:
    op.drop_column("teachers", "locked_until")
    # Postgres cannot drop a value from an enum type. Removing the added members
    # would mean rebuilding the type and rewriting every audit row, which is not
    # worth it for a downgrade: the extra members are inert if unused.
