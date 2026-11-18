"""Index exam_exercises.exercise_id again (issue #297): b05e912c399b dropped it and nothing recreated it

Revision ID: 0071_exam_exercise_index
Revises: 0070_scan_aid_switches
Create Date: 2026-11-18
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0071_exam_exercise_index"
down_revision = "0070_scan_aid_switches"
branch_labels = None
depends_on = None

_INDEX = "ix_exam_exercises_exercise_id"


def _exists() -> bool:
    return _INDEX in {i["name"] for i in sa.inspect(op.get_bind()).get_indexes("exam_exercises")}


def upgrade() -> None:
    # Idempotent: a database created from the models after this change already has the index.
    if not _exists():
        op.create_index(_INDEX, "exam_exercises", ["exercise_id"])


def downgrade() -> None:
    if _exists():
        op.drop_index(_INDEX, table_name="exam_exercises")
