"""`check-blobs`: scan rows whose file the store lacks, and files no row names (docs/dev/storage_partitions.md). Ids and counts only, never names or contents."""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scan_submission import ScanSubmission
from app.services import blob_store, scan_storage, trash


@dataclass
class ExamBlobs:
    live: int = 0
    missing: list[uuid.UUID] = field(default_factory=list)
    no_scan: int = 0


@dataclass
class BlobAudit:
    # None when no file store is configured; then a row with a `scan_path` cannot be read at all.
    store: str | None
    exams: dict[uuid.UUID, ExamBlobs]
    unchecked_paths: int = 0
    held_by_trash: int = 0
    unreferenced: int = 0

    @property
    def missing_ids(self) -> list[uuid.UUID]:
        return [sid for exam in self.exams.values() for sid in exam.missing]

    @property
    def broken(self) -> bool:
        return bool(self.missing_ids) or self.unchecked_paths > 0


async def audit(db: AsyncSession, exam_id: uuid.UUID | None = None) -> BlobAudit:
    """Compare live rows (of one exam, when given) with the store; orphan counts are store-wide. Raises `BlobStoreUnavailable` when a configured store does not validate (an unmounted store must never read as "every file missing")."""
    store = str(blob_store.root()) if blob_store.configured() else None
    rows = await db.execute(
        select(
            ScanSubmission.id,
            ScanSubmission.exam_id,
            ScanSubmission.scan_path,
            ScanSubmission.scan_ciphertext.is_not(None).label("in_db"),
        ).where(
            ScanSubmission.deleted_at.is_(None),
            *([ScanSubmission.exam_id == exam_id] if exam_id is not None else []),
        )
    )
    report = BlobAudit(store=store, exams={})
    for sub_id, exam_id, path, in_db in rows:
        exam = report.exams.setdefault(exam_id, ExamBlobs())
        exam.live += 1
        if path is not None:
            if store is None:
                report.unchecked_paths += 1
            elif not blob_store.exists_sync(path):
                exam.missing.append(sub_id)
        elif not in_db:
            exam.no_scan += 1
    if store is not None:
        named = set(
            await db.scalars(select(ScanSubmission.scan_path).where(ScanSubmission.scan_path.isnot(None)))
        )
        in_trash = await trash.all_blob_refs(db)
        for ref, _ in blob_store.iter_refs(scan_storage.KIND):
            if ref in named:
                continue
            if ref in in_trash:
                report.held_by_trash += 1
            else:
                report.unreferenced += 1
    return report


async def forget_missing(db: AsyncSession, report: BlobAudit) -> int:
    """Clear `scan_path` on live rows whose file is confirmed missing, so they read as "no scan" instead of failing; rows, scores and files stay."""
    if report.store is None:
        raise blob_store.BlobStoreUnavailable("no file store configured; nothing is confirmed missing")
    ids = report.missing_ids
    if ids:
        await db.execute(
            update(ScanSubmission)
            .where(ScanSubmission.id.in_(ids), ScanSubmission.deleted_at.is_(None))
            .values(scan_path=None)
        )
    return len(ids)
