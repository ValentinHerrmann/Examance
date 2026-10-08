"""sharing audit split (#65): consent vs withdrawal actions, resource hashes backfilled once

Revision ID: 0032_sharing_audit_split
Revises: 0031_exercise_contributions
Create Date: 2026-10-07
"""
from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "0032_sharing_audit_split"
down_revision = "0031_exercise_contributions"
branch_labels = None
depends_on = None

_NEW_ACTIONS = (
    "EXERCISE_SHARED",
    "EXERCISE_UNSHARED",
    "EXERCISE_SHARING_PAUSED",
    "EXERCISE_SHARING_RESUMED",
)


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute(
        "UPDATE exercise_resources SET content_sha256 = encode(sha256(content), 'hex') "
        "WHERE content_sha256 IS NULL"
    )
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
    with op.get_context().autocommit_block():
        for action in _NEW_ACTIONS:
            op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{action}'")


def downgrade() -> None:
    # Enum values cannot be dropped in Postgres; the backfilled hashes stay valid.
    pass
