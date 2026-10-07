"""exercise contributions

Issue #65 follow-up: proposals from a linked copy back to the shared original, the teacher's own
sharing pause, and `exercise_groups.copied_at` (copies are never re-shared as one's own).

Revision ID: 0031_exercise_contributions
Revises: 0030_exercise_sharing
Create Date: 2026-10-07
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0031_exercise_contributions"
down_revision = "0030_exercise_sharing"
branch_labels = None
depends_on = None

_NEW_ACTIONS = (
    "CONTRIBUTION_SUBMITTED",
    "CONTRIBUTION_ACCEPTED",
    "CONTRIBUTION_REJECTED",
    "CONTRIBUTION_WITHDRAWN",
)


def upgrade() -> None:
    op.add_column(
        "teachers",
        sa.Column("sharing_paused", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "exercise_groups", sa.Column("copied_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.execute(
        "UPDATE exercise_groups SET copied_at = CURRENT_TIMESTAMP WHERE source_group_id IS NOT NULL"
    )

    op.create_table(
        "exercise_contributions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("contributor_id", sa.Uuid(), nullable=False),
        sa.Column("source_group_id", sa.Uuid(), nullable=False),
        sa.Column("target_exercise_id", sa.Uuid(), nullable=True),
        sa.Column("from_exercise_id", sa.Uuid(), nullable=True),
        sa.Column(
            "kind", sa.Enum("version", "variant", name="contribution_kind"), nullable=False
        ),
        sa.Column("variant_key", sa.String(length=100), nullable=True),
        sa.Column("latex_body", sa.Text(), nullable=True),
        sa.Column("question_type", sa.String(length=20), nullable=True),
        sa.Column("correct_answers", sa.JSON(), nullable=True),
        sa.Column("penalty", sa.Float(), nullable=False, server_default="0"),
        sa.Column("max_points", sa.Float(), nullable=False, server_default="0"),
        sa.Column("message", sa.String(length=1000), nullable=True),
        sa.Column("base_fingerprint", sa.String(length=64), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "pending", "accepted", "rejected", "withdrawn", name="contribution_status"
            ),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("decision_note", sa.String(length=1000), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result_exercise_id", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["owner_id"], ["teachers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contributor_id"], ["teachers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["source_group_id"], ["exercise_groups.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_exercise_contributions_owner_id", "exercise_contributions", ["owner_id"]
    )
    op.create_index(
        "ix_exercise_contributions_contributor_id", "exercise_contributions", ["contributor_id"]
    )
    op.create_index(
        "ix_exercise_contributions_source_group_id", "exercise_contributions", ["source_group_id"]
    )
    op.create_index("ix_exercise_contributions_status", "exercise_contributions", ["status"])

    op.create_table(
        "exercise_contribution_resources",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("contribution_id", sa.Uuid(), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=150), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.Column("content_sha256", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(
            ["contribution_id"], ["exercise_contributions.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_exercise_contribution_resources_contribution_id",
        "exercise_contribution_resources",
        ["contribution_id"],
    )

    if op.get_bind().dialect.name != "postgresql":
        return
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
    with op.get_context().autocommit_block():
        for action in _NEW_ACTIONS:
            op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{action}'")


def downgrade() -> None:
    op.drop_index(
        "ix_exercise_contribution_resources_contribution_id",
        table_name="exercise_contribution_resources",
    )
    op.drop_table("exercise_contribution_resources")
    op.drop_index("ix_exercise_contributions_status", table_name="exercise_contributions")
    op.drop_index("ix_exercise_contributions_source_group_id", table_name="exercise_contributions")
    op.drop_index("ix_exercise_contributions_contributor_id", table_name="exercise_contributions")
    op.drop_index("ix_exercise_contributions_owner_id", table_name="exercise_contributions")
    op.drop_table("exercise_contributions")
    sa.Enum(name="contribution_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="contribution_kind").drop(op.get_bind(), checkfirst=True)
    op.drop_column("exercise_groups", "copied_at")
    op.drop_column("teachers", "sharing_paused")
    # Postgres cannot drop enum members; the added audit actions stay, inert.
