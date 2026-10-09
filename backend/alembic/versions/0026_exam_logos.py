"""exam logos (#46): existing accounts get the MTG logo as account logo, new ones none

Revision ID: 0026_exam_logos
Revises: 0025_exercise_code_withheld
Create Date: 2026-10-05
"""
from __future__ import annotations

from pathlib import Path

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "0026_exam_logos"
down_revision = "0025_exercise_code_withheld"
branch_labels = None
depends_on = None

_LEGACY_LOGO_CANDIDATES = (
    Path(__file__).resolve().parents[2] / "latex-assets" / "img" / "logo_mtg.pdf",
    Path("latex-assets") / "img" / "logo_mtg.pdf",
)


def upgrade() -> None:
    op.create_table(
        "teacher_logos",
        sa.Column("teacher_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("mime_type", sa.String(length=32), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
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

    legacy = next((p for p in _LEGACY_LOGO_CANDIDATES if p.is_file()), None)
    if legacy is None:
        return
    content = legacy.read_bytes()
    op.get_bind().execute(
        sa.text(
            "INSERT INTO teacher_logos (teacher_id, mime_type, byte_size, content) "
            "SELECT id, 'application/pdf', :size, :content FROM teachers"
        ).bindparams(
            sa.bindparam("size", len(content), type_=sa.Integer()),
            sa.bindparam("content", content, type_=sa.LargeBinary()),
        )
    )


def downgrade() -> None:
    op.drop_table("exam_logos")
    op.drop_table("teacher_logos")
