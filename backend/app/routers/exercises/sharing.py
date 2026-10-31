"""Exercise sharing, copying, resync and proposals (issue #65). Visibility is decided only in app/services/exercise_sharing.py. Shared rows are read-only for everyone but their owner and are only ever copied; a copy stays linked to its source for resync."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import DB, CurrentTeacher, get_current_teacher, get_exercise_for_teacher
from app.middleware.rate_limit import limiter
from app.models.exercise import Exercise
from app.models.exercise_group import ExerciseGroup
from app.models.teacher import Teacher
from app.schemas.exam import ExerciseResponse
from app.schemas.exercise_contributions import ContributionSubmit
from app.schemas.exercise_sharing import (
    BulkSharingResult,
    BulkSharingUpdate,
    CopyResponse,
    ExerciseSharingUpdate,
    ResyncPreviewResponse,
    ResyncRequest,
    ResyncVariant,
    SharedExerciseResponse,
    SharingPauseUpdate,
    SyncStatusItem,
)
from app.services import account_mail
from app.services import audit as audit_svc
from app.services import exercise_contributions as contributions
from app.services import exercise_sharing as sharing
from app.services.capabilities import ensure_exercise_sharing, require_exercise_sharing
from app.services.exercise_library import filtered, get_own_group, group_of

# `catalog` holds the fixed paths that must be matched before `GET /{exercise_id}` (library.py).
catalog = APIRouter()
router = APIRouter()

_SHARED_FIELDS = SharedExerciseResponse.model_fields.keys() - {"shared_by_email"}


def _to_shared_res(ex: Exercise, shared_by_email: str) -> SharedExerciseResponse:
    """Another account's row; the schema is the allowlist (no owner id, exam id or provenance)."""
    return SharedExerciseResponse(
        **{f: getattr(ex, f) for f in _SHARED_FIELDS}, shared_by_email=shared_by_email
    )


async def _owner_emails(rows: list[Exercise], db: AsyncSession) -> dict[uuid.UUID, str]:
    ids = {r.teacher_id for r in rows if r.teacher_id is not None}
    if not ids:
        return {}
    res = await db.execute(select(Teacher.id, Teacher.email).where(Teacher.id.in_(ids)))
    return dict(res.tuples().all())


@catalog.get("/shared")
async def list_shared_exercises(
    topic_tag: str | None = None,
    grade: str | None = None,
    subject: str | None = None,
    search: str | None = None,
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    teacher: Teacher = Depends(require_exercise_sharing),
    db: AsyncSession = Depends(get_db),
) -> list[SharedExerciseResponse]:
    """Current exercises other accounts shared with the installation (read-only; copy to use)."""
    query = select(Exercise, Teacher.email).join(Teacher, Teacher.id == Exercise.teacher_id)
    query = query.where(sharing.shared_with_clause(teacher))
    query = filtered(query, topic_tag, grade, subject, search)
    query = query.order_by(
        Exercise.name.asc(),
        Exercise.exercise_group_id.asc(),
        Exercise.variant_key.asc(),
        Exercise.id.asc(),  # unique tiebreak: offset paging must not skip or repeat rows
    )
    rows = (await db.execute(query.limit(limit).offset(offset))).tuples().all()
    return [_to_shared_res(ex, email) for ex, email in rows]


@catalog.get("/sync-status")
async def get_sync_status(
    teacher: Teacher = Depends(require_exercise_sharing),
    db: AsyncSession = Depends(get_db),
) -> list[SyncStatusItem]:
    """For each own group copied from a shared one: whether the source changed since the last sync. "source_unavailable" does not tell unshared from deleted, on purpose."""
    return [
        SyncStatusItem(
            group_id=plan.group.id,
            state=plan.state,
            locally_modified=plan.locally_modified,
            changed_variants=plan.count("changed"),
            new_variants=plan.count("new"),
            removed_variants=plan.count("removed"),
            local_variants=plan.count("local"),
        )
        for plan in await sharing.plan_groups(teacher, db)
    ]


def _shared(src: Exercise, emails: dict[uuid.UUID, str]) -> SharedExerciseResponse:
    email = emails.get(src.teacher_id, "") if src.teacher_id else ""
    return _to_shared_res(src, email)


def _set_shared(rows: list[Exercise], shared: bool) -> None:
    """Flip the share state of *rows*; `shared_at` marks when consent was given."""
    shared_at = datetime.now(UTC) if shared else None
    for row in rows:
        if row.is_public != shared:
            row.is_public = shared
            row.shared_at = shared_at


def _sharing_action(shared: bool) -> str:
    return "EXERCISE_SHARED" if shared else "EXERCISE_UNSHARED"


@router.put("/{exercise_id}/sharing")
async def set_exercise_sharing(
    request: Request,
    body: ExerciseSharingUpdate,
    ex: Exercise = Depends(get_exercise_for_teacher),
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> list[ExerciseResponse]:
    """Share an own exercise group (all its variants) with every account, or stop sharing it. Stopping is never gated, so a revoked account can still withdraw; copies stay with copiers."""
    if body.shared:
        ensure_exercise_sharing(teacher)
    if ex.exam_id is not None or ex.code_withheld:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only library exercises with code can be shared.",
        )
    group = await group_of(ex, teacher, db)
    if body.shared and group.copied_at is not None:
        # The original's author consented to share it, not this account; propose changes instead.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An exercise copied from another account cannot be shared.",
            headers={"code": "ERR_SHARE_COPY"},
        )

    rows = (
        (
            await db.execute(
                select(Exercise).where(
                    Exercise.exercise_group_id == ex.exercise_group_id,
                    Exercise.teacher_id == teacher.id,
                    Exercise.exam_id.is_(None),
                    Exercise.code_withheld.is_(False),
                )
            )
        )
        .scalars()
        .all()
    )
    if body.shared and any(r.copied_from_exercise_id for r in rows):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An exercise copied from another account cannot be shared.",
            headers={"code": "ERR_SHARE_COPY"},
        )
    _set_shared(list(rows), body.shared)
    await audit_svc.log(db, request, teacher, _sharing_action(body.shared), group.id)
    await db.flush()
    return [ExerciseResponse.from_exercise(r) for r in rows if r.is_current]


@router.post("/sharing/bulk")
async def set_sharing_bulk(
    request: Request,
    body: BulkSharingUpdate,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> BulkSharingResult:
    """Share or stop sharing every own library group at once. Copied groups are skipped (never shared as one's own); stopping is never gated."""
    if body.shared:
        ensure_exercise_sharing(teacher)
    groups = list(
        (await db.execute(select(ExerciseGroup).where(ExerciseGroup.teacher_id == teacher.id)))
        .scalars()
    )
    rows = (
        (
            await db.execute(
                select(Exercise).where(
                    Exercise.teacher_id == teacher.id,
                    Exercise.exercise_group_id.in_([g.id for g in groups]),
                    Exercise.exam_id.is_(None),
                    Exercise.code_withheld.is_(False),
                )
            )
        )
        .scalars()
        .all()
    )
    # A group is a copy if it was copied or holds a copied row (e.g. moved in by hand).
    copies: set[uuid.UUID | None] = {g.id for g in groups if g.copied_at is not None}
    copies |= {r.exercise_group_id for r in rows if r.copied_from_exercise_id}
    picked = [r for r in rows if not (body.shared and r.exercise_group_id in copies)]
    _set_shared(picked, body.shared)
    touched = {r.exercise_group_id for r in picked if r.exercise_group_id is not None}
    await audit_svc.log(db, request, teacher, _sharing_action(body.shared), teacher.id)
    await db.flush()
    return BulkSharingResult(groups=len(touched), skipped_copies=len(copies) if body.shared else 0)


@router.put("/sharing/pause", status_code=status.HTTP_204_NO_CONTENT)
async def set_sharing_paused(
    request: Request, body: SharingPauseUpdate, teacher: CurrentTeacher, db: DB
) -> None:
    """Hide (or show again) everything the account shares; per-group choices are kept. Pausing is never gated; resuming needs the sharing switch."""
    if not body.paused:
        ensure_exercise_sharing(teacher)
    teacher.sharing_paused = body.paused
    action = "EXERCISE_SHARING_PAUSED" if body.paused else "EXERCISE_SHARING_RESUMED"
    await audit_svc.log(db, request, teacher, action, teacher.id)
    await db.flush()


@router.post(
    "/{exercise_id}/copy", status_code=status.HTTP_201_CREATED
)
@limiter.limit("60/hour")
async def copy_shared_exercise(
    request: Request,
    exercise_id: uuid.UUID,
    teacher: Teacher = Depends(require_exercise_sharing),
    db: AsyncSession = Depends(get_db),
) -> CopyResponse:
    """Copy a shared exercise group into the caller's library as a new private group that stays linked to its source. 404 for anything not shared with the caller, existing or not."""
    source = (
        await db.execute(
            select(Exercise).where(
                Exercise.id == exercise_id, sharing.shared_with_clause(teacher)
            )
        )
    ).scalar_one_or_none()
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
    group, rows = await sharing.copy_shared_group(source, teacher, db)
    await audit_svc.log(db, request, teacher, "EXERCISE_COPIED", group.id)
    return CopyResponse(
        group_id=group.id, exercises=[ExerciseResponse.from_exercise(r) for r in rows]
    )


@router.post(
    "/{exercise_id}/duplicate", status_code=status.HTTP_201_CREATED
)
@limiter.limit("60/hour")
async def duplicate_exercise(
    request: Request,
    ex: Exercise = Depends(get_exercise_for_teacher),
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> CopyResponse:
    """Duplicate an own exercise group (current version of every variant) as a new private group, e.g. as the starting point for a similar exercise (issue #121)."""
    group, rows = await sharing.duplicate_own_group(ex, teacher, db)
    await audit_svc.log(db, request, teacher, "EXERCISE_DUPLICATED", group.id)
    return CopyResponse(
        group_id=group.id, exercises=[ExerciseResponse.from_exercise(r) for r in rows]
    )


@router.get("/groups/{group_id}/resync-preview")
async def resync_preview(
    group_id: uuid.UUID,
    teacher: Teacher = Depends(require_exercise_sharing),
    db: AsyncSession = Depends(get_db),
) -> ResyncPreviewResponse:
    """Per variant of a copied group: own current row, source current row and the source fingerprint the resync request must echo."""
    plan = await sharing.plan_group(teacher, db, group_id)
    emails = await _owner_emails([v.source for v in plan.variants if v.source], db)
    return ResyncPreviewResponse(
        group_id=plan.group.id,
        state=plan.state,
        variants=[
            ResyncVariant(
                kind=v.kind,
                locally_modified=v.locally_modified,
                source_exercise_id=v.source.id if v.source else None,
                source_fingerprint=v.source_fingerprint,
                source=_shared(v.source, emails) if v.source else None,
                own=ExerciseResponse.from_exercise(v.own) if v.own else None,
            )
            for v in plan.variants
        ],
    )


@router.post("/groups/{group_id}/resync")
@limiter.limit("60/hour")
async def resync_group(
    request: Request,
    group_id: uuid.UUID,
    body: ResyncRequest,
    teacher: Teacher = Depends(require_exercise_sharing),
    db: AsyncSession = Depends(get_db),
) -> list[ExerciseResponse]:
    """Bring a copied group up to its source: changed variants become new versions (the old row stays for the exams that link it), new source variants new rows. 409 if the source changed since the reviewed preview."""
    plan = await sharing.plan_group(teacher, db, group_id, lock=True)
    if plan.state == "source_unavailable":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The source of this exercise is no longer shared.",
            headers={"code": "ERR_SHARE_SOURCE_UNAVAILABLE"},
        )
    created = await sharing.apply_resync(
        plan,
        body.source_fingerprints,
        db,
        {sid: o.latex_body for sid, o in body.overrides.items()},
    )
    await audit_svc.log(db, request, teacher, "EXERCISE_RESYNCED", plan.group.id)
    return [ExerciseResponse.from_exercise(r) for r in created]


@router.post(
    "/groups/{group_id}/contributions",
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("30/hour")
async def submit_contributions(
    request: Request,
    group_id: uuid.UUID,
    body: ContributionSubmit,
    background_tasks: BackgroundTasks,
    teacher: Teacher = Depends(require_exercise_sharing),
    db: AsyncSession = Depends(get_db),
) -> list[uuid.UUID]:
    """Propose variants of a linked copy to the original's author: changed ones as new versions, ones added to the copy as new variants. The author is notified and decides."""
    rows = await contributions.submit(teacher, group_id, body.exercise_ids, body.message, db)
    for row in rows:
        await audit_svc.log(db, request, teacher, "CONTRIBUTION_SUBMITTED", row.id)
    mails = await contributions.notice_mails(db, rows[0].owner_id, [r.id for r in rows])
    background_tasks.add_task(account_mail.send_all, mails)
    return [r.id for r in rows]


@router.delete("/groups/{group_id}/source", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_group_source(
    group_id: uuid.UUID,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Detach a copied group from its source; the content stays, update notices stop."""
    group = await get_own_group(group_id, teacher.id, db)
    group.source_group_id = None
    await db.flush()
