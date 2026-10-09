"""omr training sample token: re-donation replaces the earlier row; nullable for old rows

Revision ID: 0023_omr_training_sample_token
Revises: 0022_omr_training_samples
Create Date: 2026-09-28
"""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "0023_omr_training_sample_token"
down_revision = "0022_omr_training_samples"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "omr_training_samples",
        sa.Column("sample_token", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        op.f("ix_omr_training_samples_sample_token"),
        "omr_training_samples",
        ["sample_token"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_omr_training_samples_sample_token"), table_name="omr_training_samples"
    )
    op.drop_column("omr_training_samples", "sample_token")
