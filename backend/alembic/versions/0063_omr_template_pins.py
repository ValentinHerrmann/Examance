"""Pinned OMR templates: client-sealed answer-sheet layouts of printed exams (issue #239)

Revision ID: 0063_omr_template_pins
Revises: 0062_exam_digital_grading
Create Date: 2026-11-08
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0063_omr_template_pins"
down_revision = "0062_exam_digital_grading"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "omr_template_pins",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("exam_id", sa.Uuid(), nullable=False),
        sa.Column("layout_hash", sa.String(length=64), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("pinned_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_pinned_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("payload_ciphertext", sa.LargeBinary(), nullable=False),
        sa.Column("payload_iv", sa.LargeBinary(), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["exam_id"], ["exams.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("exam_id", "layout_hash", name="uq_omr_template_pin_layout"),
        sa.CheckConstraint("source IN ('download', 'printed')", name="ck_omr_template_pins_source"),
    )
    op.create_index("ix_omr_template_pins_exam_id", "omr_template_pins", ["exam_id"])


def downgrade() -> None:
    op.drop_index("ix_omr_template_pins_exam_id", table_name="omr_template_pins")
    op.drop_table("omr_template_pins")
