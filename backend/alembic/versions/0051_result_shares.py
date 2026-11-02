"""Result shares: graded PDFs sealed for students' personal links, plus their audit actions (issue #207)

Revision ID: 0051_result_shares
Revises: 0050_webauthn_credential_rp_id
Create Date: 2026-11-02
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0051_result_shares"
down_revision = "0050_webauthn_credential_rp_id"
branch_labels = None
depends_on = None

_ACTIONS = ("RESULT_SHARED", "RESULT_SHARE_REVOKED")


def upgrade() -> None:
    op.create_table(
        "result_shares",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "teacher_id",
            sa.Uuid(),
            sa.ForeignKey("teachers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "exam_id",
            sa.Uuid(),
            sa.ForeignKey("exams.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("student_key", sa.String(64), nullable=False),
        sa.Column("lookup_hash", sa.String(64), nullable=False),
        sa.Column("factor", sa.String(16), nullable=False),
        sa.Column("kdf_salt", sa.LargeBinary(16), nullable=True),
        sa.Column("iv", sa.LargeBinary(12), nullable=False),
        sa.Column("blob_path", sa.String(255), nullable=True),
        sa.Column("ciphertext", sa.LargeBinary(), nullable=True),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("exam_id", "student_key", name="uq_result_shares_student"),
        sa.UniqueConstraint("lookup_hash", name="uq_result_shares_lookup_hash"),
    )
    op.create_index("ix_result_shares_teacher_id", "result_shares", ["teacher_id"])
    op.create_index("ix_result_shares_exam_id", "result_shares", ["exam_id"])
    op.create_index("ix_result_shares_expires_at", "result_shares", ["expires_at"])
    if op.get_bind().dialect.name != "postgresql":
        return
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
    with op.get_context().autocommit_block():
        for action in _ACTIONS:
            op.execute(f"ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '{action}'")


def downgrade() -> None:
    op.drop_index("ix_result_shares_expires_at", table_name="result_shares")
    op.drop_index("ix_result_shares_exam_id", table_name="result_shares")
    op.drop_index("ix_result_shares_teacher_id", table_name="result_shares")
    op.drop_table("result_shares")
    # Postgres cannot drop an enum value; the unused values are harmless.
