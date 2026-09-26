"""per-exercise scores

Adds exercise_scores. Per-question results previously existed only in the
client's IndexedDB, which lockSession() wipes in all-server mode. Payload is
client-sealed; there is deliberately no plaintext score column.

Revision ID: 0021_exercise_scores
Revises: 0020_factor_activity
Create Date: 2026-09-22
"""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "0021_exercise_scores"
down_revision = "0020_factor_activity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "exercise_scores",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("exercise_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("payload_ciphertext", sa.LargeBinary(), nullable=True),
        sa.Column("payload_iv", sa.LargeBinary(length=12), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["submission_id"], ["scan_submissions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercises.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("submission_id", "exercise_id", name="uq_exercise_score_pair"),
    )
    op.create_index(
        op.f("ix_exercise_scores_submission_id"),
        "exercise_scores",
        ["submission_id"],
    )
    op.create_index(
        op.f("ix_exercise_scores_exercise_id"),
        "exercise_scores",
        ["exercise_id"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_exercise_scores_exercise_id"), table_name="exercise_scores")
    op.drop_index(op.f("ix_exercise_scores_submission_id"), table_name="exercise_scores")
    op.drop_table("exercise_scores")
