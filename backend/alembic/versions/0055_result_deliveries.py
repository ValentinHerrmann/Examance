"""result deliveries (#221): per-student delivery status of result mails and Artemis messages

Revision ID: 0055_result_deliveries
Revises: 0054_result_delivery
Create Date: 2026-11-03
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0055_result_deliveries"
down_revision = "0054_result_delivery"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "result_deliveries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("teacher_id", sa.Uuid(), nullable=False),
        sa.Column("exam_id", sa.Uuid(), nullable=False),
        sa.Column("student_key", sa.String(length=64), nullable=False),
        sa.Column("channel", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("detail", sa.String(length=200), nullable=True),
        sa.Column("mail_token", sa.String(length=32), nullable=True),
        sa.Column("watch_until", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["exam_id"], ["exams.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["teacher_id"], ["teachers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("exam_id", "student_key", "channel", name="uq_result_deliveries_student"),
        sa.UniqueConstraint("mail_token"),
    )
    op.create_index("ix_result_deliveries_teacher_id", "result_deliveries", ["teacher_id"])
    op.create_index("ix_result_deliveries_exam_id", "result_deliveries", ["exam_id"])
    op.create_index("ix_result_deliveries_updated_at", "result_deliveries", ["updated_at"])


def downgrade() -> None:
    op.drop_index("ix_result_deliveries_updated_at", table_name="result_deliveries")
    op.drop_index("ix_result_deliveries_exam_id", table_name="result_deliveries")
    op.drop_index("ix_result_deliveries_teacher_id", table_name="result_deliveries")
    op.drop_table("result_deliveries")
