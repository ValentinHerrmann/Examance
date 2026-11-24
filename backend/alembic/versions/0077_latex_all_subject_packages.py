"""Account switch to load every LaTeX subject package (issue #341)

Revision ID: 0077_latex_all_subject_packages
Revises: 0076_review_reply_complete
Create Date: 2026-11-23
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0077_latex_all_subject_packages"
down_revision = "0076_review_reply_complete"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "teachers",
        sa.Column(
            "latex_all_subject_packages", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )


def downgrade() -> None:
    op.drop_column("teachers", "latex_all_subject_packages")
