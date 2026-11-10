"""Exam statistics: client-sealed anonymised statistics kept after results are purged (issue #238)

Revision ID: 0064_exam_statistics
Revises: 0063_omr_template_pins
Create Date: 2026-11-10
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0064_exam_statistics"
down_revision = "0063_omr_template_pins"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "exam_statistics",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("teacher_id", sa.Uuid(), nullable=False),
        sa.Column("exam_id", sa.Uuid(), nullable=False),
        sa.Column("keep_after_exam_delete", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("payload_ciphertext", sa.LargeBinary(), nullable=False),
        sa.Column("payload_iv", sa.LargeBinary(), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["teacher_id"], ["teachers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("exam_id", name="uq_exam_statistics_exam_id"),
    )
    op.create_index("ix_exam_statistics_teacher_id", "exam_statistics", ["teacher_id"])


def downgrade() -> None:
    op.drop_index("ix_exam_statistics_teacher_id", table_name="exam_statistics")
    op.drop_table("exam_statistics")
