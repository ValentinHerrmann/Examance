"""teacher logo modes

The bundled MTG logo becomes the account default instead of a copied file (issue #46): an
account without a teacher_logos row prints it, and a row now records a deviation, `none` (no
logo) or `custom` (its own file), like exam_logos. Rows that 0026 backfilled with the MTG logo
are removed, so those accounts follow the default (and pick up a future change to it).

Revision ID: 0027_teacher_logo_modes
Revises: 0026_exam_logos
Create Date: 2026-10-05
"""
from __future__ import annotations

from pathlib import Path

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0027_teacher_logo_modes"
down_revision = "0026_exam_logos"
branch_labels = None
depends_on = None

_DEFAULT_LOGO_CANDIDATES = (
    Path(__file__).resolve().parents[2] / "latex-assets" / "img" / "logo_mtg.pdf",
    Path("latex-assets") / "img" / "logo_mtg.pdf",
)


def _default_logo() -> bytes | None:
    path = next((p for p in _DEFAULT_LOGO_CANDIDATES if p.is_file()), None)
    return path.read_bytes() if path else None


def upgrade() -> None:
    op.add_column("teacher_logos", sa.Column("mode", sa.String(length=8), nullable=True))
    op.execute("UPDATE teacher_logos SET mode = 'custom'")
    op.alter_column("teacher_logos", "mode", nullable=False)
    op.alter_column("teacher_logos", "mime_type", nullable=True)
    op.alter_column("teacher_logos", "content", nullable=True)
    op.alter_column("teacher_logos", "byte_size", server_default="0")
    op.create_check_constraint(
        "ck_teacher_logos_mode", "teacher_logos", "mode IN ('none', 'custom')"
    )
    op.create_check_constraint(
        "ck_teacher_logos_custom_content",
        "teacher_logos",
        "mode = 'none' OR content IS NOT NULL",
    )

    default = _default_logo()
    if default is not None:
        op.get_bind().execute(
            sa.text("DELETE FROM teacher_logos WHERE content = :content").bindparams(
                sa.bindparam("content", default, type_=sa.LargeBinary())
            )
        )


def downgrade() -> None:
    op.drop_constraint("ck_teacher_logos_custom_content", "teacher_logos", type_="check")
    op.drop_constraint("ck_teacher_logos_mode", "teacher_logos", type_="check")
    op.execute("DELETE FROM teacher_logos WHERE mode = 'none'")
    default = _default_logo()
    if default is not None:
        # Accounts on the default get the file back, as 0026 left them.
        op.get_bind().execute(
            sa.text(
                "INSERT INTO teacher_logos (teacher_id, mode, mime_type, byte_size, content) "
                "SELECT id, 'custom', 'application/pdf', :size, :content FROM teachers "
                "WHERE id NOT IN (SELECT teacher_id FROM teacher_logos)"
            ).bindparams(
                sa.bindparam("size", len(default), type_=sa.Integer()),
                sa.bindparam("content", default, type_=sa.LargeBinary()),
            )
        )
    op.alter_column("teacher_logos", "byte_size", server_default=None)
    op.alter_column("teacher_logos", "content", nullable=False)
    op.alter_column("teacher_logos", "mime_type", nullable=False)
    op.drop_column("teacher_logos", "mode")
