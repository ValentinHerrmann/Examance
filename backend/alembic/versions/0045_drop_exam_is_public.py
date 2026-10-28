"""Drop exams.is_public: nothing ever read or wrote it (sharing is per exercise, issue #65)

Revision ID: 0045_drop_exam_is_public
Revises: 0044_exam_extra_notes
Create Date: 2026-10-28
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0045_drop_exam_is_public"
down_revision = "0044_exam_extra_notes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("exams", "is_public")


def downgrade() -> None:
    op.add_column(
        "exams",
        sa.Column("is_public", sa.Boolean(), server_default="false", nullable=False),
    )
