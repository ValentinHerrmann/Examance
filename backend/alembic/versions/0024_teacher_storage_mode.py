"""teacher storage mode

Adds teachers.storage_mode: the account's chosen storage mode ('all-server' or 'hybrid'). Nullable with
no default and no backfill: every account chooses explicitly on its next sign-in (issue #47). The mode
used to live per browser, so no server-side value could be derived from existing data.

Revision ID: 0024_teacher_storage_mode
Revises: 0023_omr_training_sample_token
Create Date: 2026-10-04
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0024_teacher_storage_mode"
down_revision = "0023_omr_training_sample_token"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("teachers", sa.Column("storage_mode", sa.String(length=16), nullable=True))
    op.create_check_constraint(
        "ck_teachers_storage_mode",
        "teachers",
        "storage_mode IS NULL OR storage_mode IN ('all-server', 'hybrid')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_teachers_storage_mode", "teachers", type_="check")
    op.drop_column("teachers", "storage_mode")
