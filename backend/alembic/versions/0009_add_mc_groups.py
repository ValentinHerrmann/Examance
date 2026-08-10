"""Add exam_mc_groups table and mc_group_id/sub_index to exam_exercises."""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0009_add_mc_groups"
down_revision: Union[str, None] = "b05e912c399b"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.create_table(
        "exam_mc_groups",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("exam_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False, server_default="Grundlagen"),
        sa.Column(
            "scoring_text",
            sa.Text(),
            nullable=False,
            server_default=(
                "Für jedes korrekte Kreuz 1BE; für jedes falsche Kreuz -0,5BE. "
                "Pro Teilaufgabe aber immer $\\geq$0BE"
            ),
        ),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["exam_id"], ["exams.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_exam_mc_groups_exam_id", "exam_mc_groups", ["exam_id"])

    op.add_column(
        "exam_exercises",
        sa.Column("mc_group_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "exam_exercises",
        sa.Column("sub_index", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_exam_exercises_mc_group_id",
        "exam_exercises",
        "exam_mc_groups",
        ["mc_group_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_exam_exercises_mc_group_id", "exam_exercises", ["mc_group_id"])


def downgrade() -> None:
    op.drop_index("ix_exam_exercises_mc_group_id", table_name="exam_exercises")
    op.drop_constraint("fk_exam_exercises_mc_group_id", "exam_exercises", type_="foreignkey")
    op.drop_column("exam_exercises", "sub_index")
    op.drop_column("exam_exercises", "mc_group_id")
    op.drop_index("ix_exam_mc_groups_exam_id", table_name="exam_mc_groups")
    op.drop_table("exam_mc_groups")
