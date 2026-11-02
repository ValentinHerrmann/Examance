"""Trash — /api/v1/trash (issue #125). The teacher's own deletes of the last RETENTION_GRACE_DAYS days, grouped by UI action; restore or erase a whole group. Design: docs/dev/trash.md."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Request, Response, status

from app.config import settings
from app.dependencies import DB, get_teaching_teacher
from app.models.teacher import Teacher
from app.models.trash_item import TrashItem
from app.schemas.trash import (
    TrashEntryOut,
    TrashGroupOut,
    TrashListOut,
    TrashRestoreOut,
    TrashSkippedOut,
)
from app.services import audit as audit_svc
from app.services import trash

router = APIRouter(prefix="/trash", tags=["trash"], dependencies=[Depends(get_teaching_teacher)])


def _entry(item: TrashItem) -> TrashEntryOut:
    return TrashEntryOut(
        id=item.id,
        kind=item.kind,
        label=item.label,
        deleted_at=item.deleted_at,
        purge_after=item.purge_after,
    )


@router.get("")
async def list_trash(db: DB, teacher: Teacher = Depends(get_teaching_teacher)) -> TrashListOut:
    """The caller's trash, newest group first."""
    groups: dict[uuid.UUID, list[TrashItem]] = {}
    for item in await trash.list_items(db, teacher):
        groups.setdefault(item.group_id, []).append(item)
    return TrashListOut(
        grace_days=settings.RETENTION_GRACE_DAYS,
        groups=[
            TrashGroupOut(
                group_id=group_id,
                deleted_at=max(i.deleted_at for i in items),
                purge_after=min(i.purge_after for i in items),
                entries=[_entry(i) for i in reversed(items)],
            )
            for group_id, items in groups.items()
        ],
    )


@router.post("/{group_id}/restore")
async def restore_trash_group(
    group_id: uuid.UUID,
    request: Request,
    db: DB,
    teacher: Teacher = Depends(get_teaching_teacher),
) -> TrashRestoreOut:
    """Put back what the group deleted, as far as possible, and report what could not come back. Never overwrites live data. Result rows need the `server_results` feature (`403 ERR_FEATURE_NOT_ALLOWED`)."""
    report = await trash.restore(db, request, teacher, group_id)
    return TrashRestoreOut(
        restored=report.restored,
        skipped=[TrashSkippedOut.model_validate(s) for s in report.skipped],
    )


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
async def purge_trash_group(
    group_id: uuid.UUID,
    request: Request,
    db: DB,
    teacher: Teacher = Depends(get_teaching_teacher),
) -> Response:
    """Erase the group for good, scan files included."""
    items = await trash.group_items(db, teacher, group_id)
    await trash.purge(db, items)
    await audit_svc.log(db, request, teacher, "TRASH_PURGED", group_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
