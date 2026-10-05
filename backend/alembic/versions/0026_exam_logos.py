"""exam logos

Adds teacher_logos (an account that prints no logo or its own instead of the default) and
exam_logos (an exam that prints no logo or its own instead of the account's), issue #46. Until now
Schulaufgabe.sty printed the bundled MTG logo on every exam; the style now prints whichever logo
file the compile writes. The MTG logo stays the default: an account without a teacher_logos row
prints it, so existing exams look the same without a backfill.

Revision ID: 0026_exam_logos
Revises: 0025_exercise_code_withheld
Create Date: 2026-10-05
"""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "0026_exam_logos"
down_revision = "0025_exercise_code_withheld"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "teacher_logos",
        sa.Column("teacher_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("mode", sa.String(length=8), nullable=False),
        sa.Column("mime_type", sa.String(length=32), nullable=True),
        sa.Column("byte_size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("content", sa.LargeBinary(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("mode IN ('none', 'custom')", name="ck_teacher_logos_mode"),
        sa.CheckConstraint(
            "mode = 'none' OR content IS NOT NULL", name="ck_teacher_logos_custom_content"
        ),
        sa.ForeignKeyConstraint(["teacher_id"], ["teachers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("teacher_id"),
    )
    op.create_table(
        "exam_logos",
        sa.Column("exam_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("mode", sa.String(length=8), nullable=False),
        sa.Column("mime_type", sa.String(length=32), nullable=True),
        sa.Column("byte_size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("content", sa.LargeBinary(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("mode IN ('none', 'custom')", name="ck_exam_logos_mode"),
        sa.CheckConstraint(
            "mode = 'none' OR content IS NOT NULL", name="ck_exam_logos_custom_content"
        ),
        sa.ForeignKeyConstraint(["exam_id"], ["exams.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("exam_id"),
    )


def downgrade() -> None:
    op.drop_table("exam_logos")
    op.drop_table("teacher_logos")
