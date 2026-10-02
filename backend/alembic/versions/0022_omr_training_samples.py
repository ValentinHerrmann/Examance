"""omr training samples

Adds omr_training_samples: opt-in, anonymous crops of teacher-verified MC answer
boxes for training a shared checkbox classifier. No foreign keys and no
identifiers by design; created_on is a date so retention can purge old rows.

Revision ID: 0022_omr_training_samples
Revises: 0021_exercise_scores
Create Date: 2026-09-27
"""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "0022_omr_training_samples"
down_revision = "0021_exercise_scores"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "omr_training_samples",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_on",
            sa.Date(),
            server_default=sa.text("CURRENT_DATE"),
            nullable=False,
        ),
        sa.Column("schema_version", sa.SmallInteger(), nullable=False),
        sa.Column("algorithm_version", sa.SmallInteger(), nullable=False),
        sa.Column("label_selected", sa.Boolean(), nullable=False),
        sa.Column("crop_width", sa.Integer(), nullable=False),
        sa.Column("crop_height", sa.Integer(), nullable=False),
        sa.Column("crop", sa.LargeBinary(), nullable=False),
        sa.Column("meta", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_omr_training_samples_created_on"),
        "omr_training_samples",
        ["created_on"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_omr_training_samples_created_on"), table_name="omr_training_samples")
    op.drop_table("omr_training_samples")
