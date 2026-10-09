"""deleted exam retention (#69): backfill erasure deadlines for soft-deleted rows

Revision ID: 0034_deleted_exam_retention
Revises: 0033_exam_topic
Create Date: 2026-10-08
"""
from __future__ import annotations

from datetime import date, timedelta

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0034_deleted_exam_retention"
down_revision = "0033_exam_topic"
branch_labels = None
depends_on = None

_CHILD_TABLES = ("student_identities", "scan_submissions")


def _grace_days() -> int:
    # Imported here: `alembic heads` loads this module without the app's settings.
    from app.config import settings

    return int(getattr(settings, "RETENTION_GRACE_DAYS", 7))


def upgrade() -> None:
    deadline = date.today() + timedelta(days=_grace_days())
    exams = sa.table("exams", sa.column("id"), sa.column("deleted_at"))
    deleted_exam_ids = sa.select(exams.c.id).where(exams.c.deleted_at.isnot(None))
    for name in _CHILD_TABLES:
        child = sa.table(
            name,
            sa.column("exam_id"),
            sa.column("deleted_at", sa.DateTime(timezone=True)),
            sa.column("retention_until", sa.Date()),
        )
        op.execute(
            child.update()
            .where(child.c.deleted_at.is_(None), child.c.exam_id.in_(deleted_exam_ids))
            .values(deleted_at=sa.func.now(), retention_until=deadline)
        )
        op.execute(
            child.update()
            .where(child.c.deleted_at.isnot(None), child.c.retention_until.is_(None))
            .values(retention_until=deadline)
        )


def downgrade() -> None:
    # A backfilled deadline cannot be told from a real one, and erased rows cannot come back.
    pass
