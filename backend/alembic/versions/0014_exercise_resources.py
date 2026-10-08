"""exercise resource files, stored as plaintext bytes like exercises.latex_body

Revision ID: 0014_exercise_resources
Revises: 0013_scope_identity_to_exam
Create Date: 2026-08-19
"""
from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision = "0014_exercise_resources"
down_revision = "0013_scope_identity_to_exam"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "exercise_resources",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("exercise_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=150), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercises.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("exercise_id", "filename", name="uq_exercise_resource_name"),
    )
    op.create_index(
        op.f("ix_exercise_resources_exercise_id"),
        "exercise_resources",
        ["exercise_id"],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_exercise_resources_exercise_id"), table_name="exercise_resources")
    op.drop_table("exercise_resources")
