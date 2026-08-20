"""Make exam_exercises.mc_group_id ON DELETE SET NULL instead of CASCADE.

Dissolving or rewriting an MC group must not delete the exam↔exercise links of
its members: those exercises stay part of the exam, they just stop being grouped.
With ON DELETE CASCADE, every `PATCH /exams/{id}` that replaced the group set
also deleted the member junction rows, so the exercises silently dropped out of
the exam (and the group came back empty).
"""
from __future__ import annotations

from typing import Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0015_mc_group_link_set_null"
down_revision: Union[str, None] = "0014_exercise_resources"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None

_FK = "fk_exam_exercises_mc_group_id"


def upgrade() -> None:
    op.drop_constraint(_FK, "exam_exercises", type_="foreignkey")
    op.create_foreign_key(
        _FK,
        "exam_exercises",
        "exam_mc_groups",
        ["mc_group_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(_FK, "exam_exercises", type_="foreignkey")
    op.create_foreign_key(
        _FK,
        "exam_exercises",
        "exam_mc_groups",
        ["mc_group_id"],
        ["id"],
        ondelete="CASCADE",
    )
