"""Where a submission's scan lives: one of `scan_path` (file partition) or `scan_ciphertext` (DB). The only code that reads or writes those two columns; moves between them: `blob_migration`."""
from __future__ import annotations

import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scan_submission import ScanSubmission
from app.services import blob_store

KIND = "scans"


def has_scan(sub: ScanSubmission) -> bool:
    """Only for rows loaded from the DB (`scan_in_db` is a SQL expression, unset on new rows)."""
    return sub.scan_path is not None or bool(sub.scan_in_db)


async def load_scan(db: AsyncSession, sub: ScanSubmission) -> bytes | None:
    # Both set only if a pre-#114 backend rewrote a moved row mid-deploy: the DB copy is newer.
    if sub.scan_in_db:
        return await db.scalar(
            select(ScanSubmission.scan_ciphertext).where(ScanSubmission.id == sub.id)
        )
    if sub.scan_path is not None:
        return await blob_store.get(sub.scan_path)
    return None


async def store_scan(
    db: AsyncSession, sub: ScanSubmission, exam_id: uuid.UUID, sub_id: uuid.UUID, data: bytes
) -> None:
    """Put *data* where the configured backend says; the replaced file goes after the commit."""
    old_path = sub.scan_path
    if blob_store.writes_to_files():
        ref = await blob_store.put(KIND, str(exam_id), str(sub_id), data)
        blob_store.remember_written(db, ref)
        sub.scan_path, sub.scan_ciphertext = ref, None
    else:
        sub.scan_path, sub.scan_ciphertext = None, data
    if old_path is not None:
        blob_store.delete_after_commit(db, old_path)


def forget_scans(db: AsyncSession, subs: Iterable[ScanSubmission]) -> None:
    """For deleting single rows (directly or by a DB cascade): drop their files after the commit."""
    for sub in subs:
        if sub.scan_path is not None:
            blob_store.delete_after_commit(db, sub.scan_path)


def forget_scans_of_exams(db: AsyncSession, exam_ids: list[uuid.UUID]) -> None:
    """For deletes that cascade in the DB (the ORM never sees the rows): drop the exams' dirs."""
    if blob_store.configured():
        for exam_id in exam_ids:
            blob_store.delete_group_after_commit(db, KIND, str(exam_id))
