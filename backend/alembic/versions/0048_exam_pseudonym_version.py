"""Per-exam pseudonym version and a rename-friendly identity FK, for the keyed pseudonym HMAC (issue #177)

Revision ID: 0048_exam_pseudonym_version
Revises: 0047_exam_results_purged_at
Create Date: 2026-11-01
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0048_exam_pseudonym_version"
down_revision = "0047_exam_results_purged_at"
branch_labels = None
depends_on = None

_FK = "scan_submissions_identity_fkey"


def _recreate_fk(on_update: str) -> None:
    # Created in 0013 on PostgreSQL only; SQLite (tests) builds the schema from the models.
    if op.get_bind().dialect.name != "postgresql":
        return
    op.execute(f"ALTER TABLE scan_submissions DROP CONSTRAINT IF EXISTS {_FK}")
    op.execute(
        f"ALTER TABLE scan_submissions ADD CONSTRAINT {_FK} "
        "FOREIGN KEY (pseudonym_hmac, exam_id) "
        "REFERENCES student_identities (pseudonym_hmac, exam_id) "
        f"ON DELETE CASCADE{on_update}"
    )


def upgrade() -> None:
    op.add_column(
        "exams",
        sa.Column("pseudonym_version", sa.SmallInteger(), nullable=False, server_default="1"),
    )
    _recreate_fk(" ON UPDATE CASCADE")


def downgrade() -> None:
    _recreate_fk("")
    op.drop_column("exams", "pseudonym_version")
