"""Objections through the result link and the grading review record (issue #226)

Revision ID: 0066_share_reviews
Revises: 0065_favorites_share
Create Date: 2026-11-13
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0066_share_reviews"
down_revision = "0065_favorites_share"
branch_labels = None
depends_on = None

_ACTIONS = ("REVIEW_SUBMITTED", "REVIEW_REPLIED")


def upgrade() -> None:
    op.add_column("result_shares", sa.Column("wrapped_key", sa.LargeBinary(), nullable=True))
    op.add_column("result_shares", sa.Column("content_updated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("result_shares", sa.Column("review_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("teachers", sa.Column("review_mail", sa.Boolean(), nullable=True))
    op.create_table(
        "result_share_reviews",
        sa.Column(
            "share_id",
            sa.Uuid(),
            sa.ForeignKey("result_shares.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("teacher_id", sa.Uuid(), sa.ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("exam_id", sa.Uuid(), sa.ForeignKey("exams.id", ondelete="CASCADE"), nullable=False),
        sa.Column("student_key", sa.String(64), nullable=False),
        sa.Column("objection_iv", sa.LargeBinary(12), nullable=True),
        sa.Column("objection_ct", sa.LargeBinary(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reply_iv", sa.LargeBinary(12), nullable=True),
        sa.Column("reply_ct", sa.LargeBinary(), nullable=True),
        sa.Column("replied_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_result_share_reviews_exam_id", "result_share_reviews", ["exam_id"])
    op.create_index("ix_result_share_reviews_teacher_id", "result_share_reviews", ["teacher_id"])
    op.create_table(
        "grading_reviews",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("exam_id", sa.Uuid(), sa.ForeignKey("exams.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "submission_id",
            sa.Uuid(),
            sa.ForeignKey("scan_submissions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("payload_ciphertext", sa.LargeBinary(), nullable=True),
        sa.Column("payload_iv", sa.LargeBinary(12), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("submission_id", name="uq_grading_review_submission"),
    )
    op.create_index("ix_grading_reviews_exam_id", "grading_reviews", ["exam_id"])
    op.create_index("ix_grading_reviews_submission_id", "grading_reviews", ["submission_id"])
    if op.get_bind().dialect.name != "postgresql":
        return
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
    with op.get_context().autocommit_block():
        for action in _ACTIONS:
            op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{action}'")


def downgrade() -> None:
    op.drop_index("ix_grading_reviews_submission_id", table_name="grading_reviews")
    op.drop_index("ix_grading_reviews_exam_id", table_name="grading_reviews")
    op.drop_table("grading_reviews")
    op.drop_index("ix_result_share_reviews_teacher_id", table_name="result_share_reviews")
    op.drop_index("ix_result_share_reviews_exam_id", table_name="result_share_reviews")
    op.drop_table("result_share_reviews")
    op.drop_column("teachers", "review_mail")
    op.drop_column("result_shares", "review_until")
    op.drop_column("result_shares", "content_updated_at")
    op.drop_column("result_shares", "wrapped_key")
    # Postgres cannot drop an enum value; the unused values are harmless.
