"""exercise code withheld

Adds exercises.code_withheld: the exercise came from another teacher's results-only .bgproj
archive and has no LaTeX. It keeps name, points and answer key so its scans and scores grade as
usual; the client disables compiling and editing it (issue #47).

Revision ID: 0025_exercise_code_withheld
Revises: 0024_teacher_storage_mode
Create Date: 2026-10-04
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0025_exercise_code_withheld"
down_revision = "0024_teacher_storage_mode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "exercises",
        sa.Column("code_withheld", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("exercises", "code_withheld")
