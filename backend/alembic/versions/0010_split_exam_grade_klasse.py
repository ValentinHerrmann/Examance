"""Split exam grade (school year) and klasse (course).

Revision ID: 0010_split_exam_grade_klasse
Revises: 0009_add_mc_groups
Create Date: 2026-08-14 12:00:00.000000

"""
import re
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "0010_split_exam_grade_klasse"
down_revision: Union[str, None] = "0009_add_mc_groups"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("exams", sa.Column("grade", sa.String(length=50), nullable=True))

    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, klasse FROM exams WHERE klasse IS NOT NULL")).fetchall()
    for row_id, klasse_val in rows:
        if klasse_val:
            m = re.match(r"^(\d+)\s*(.*)$", klasse_val.strip())
            if m:
                g_val, k_val = m.group(1), m.group(2)
                bind.execute(
                    sa.text("UPDATE exams SET grade = :g, klasse = :k WHERE id = :id"),
                    {"g": g_val, "k": k_val, "id": row_id},
                )


def downgrade() -> None:
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, grade, klasse FROM exams")).fetchall()
    for row_id, grade_val, klasse_val in rows:
        g = (grade_val or "").strip()
        k = (klasse_val or "").strip()
        if g and k:
            combined = k if k.lower().startswith(g.lower()) else f"{g}{k}"
        else:
            combined = g or k or None
        if combined is not None:
            bind.execute(
                sa.text("UPDATE exams SET klasse = :k WHERE id = :id"),
                {"k": combined, "id": row_id},
            )

    op.drop_column("exams", "grade")
