"""Proposals back to a shared original — /api/v1/exercises/contributions/* (issue #65).

Registered before the exercises router, whose `/{exercise_id}` would otherwise capture these
paths. Only the owner and the contributor of a proposal ever see it; anyone else gets 404."""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_teacher, get_teaching_teacher
from app.models.exercise import Exercise
from app.models.exercise_contribution import ExerciseContribution, ExerciseContributionResource
from app.models.exercise_group import ExerciseGroup
from app.models.teacher import Teacher
from app.routers.exercises import _to_res
from app.schemas.exercise_contributions import (
    ContributionAccept,
    ContributionCount,
    ContributionDetail,
    ContributionFile,
    ContributionReject,
    ContributionSummary,
    PendingForGroup,
)
from app.services import audit as audit_svc
from app.services import exercise_contributions as contrib
from app.services.capabilities import require_exercise_sharing
from app.services.exercise_sharing import resource_digests
from app.services.latex_resources import resource_response

router = APIRouter(
    prefix="/exercises/contributions",
    tags=["exercise-contributions"],
    dependencies=[Depends(get_teaching_teacher)],
)


async def _summaries(
    rows: Sequence[ExerciseContribution], viewer: Teacher, db: AsyncSession
) -> list[ContributionSummary]:
    """Summaries as *viewer* sees them, with one query per lookup kind rather than per row."""
    teacher_ids = {r.contributor_id if r.owner_id == viewer.id else r.owner_id for r in rows}
    emails = dict(
        (await db.execute(select(Teacher.id, Teacher.email).where(Teacher.id.in_(teacher_ids))))
        .tuples()
        .all()
    )
    names = dict(
        (
            await db.execute(
                select(ExerciseGroup.id, ExerciseGroup.name).where(
                    ExerciseGroup.id.in_({r.source_group_id for r in rows})
                )
            )
        )
        .tuples()
        .all()
    )
    # The contributor's group a proposal came from, if that row is still theirs.
    from_ids = {r.from_exercise_id for r in rows if r.from_exercise_id is not None}
    copy_groups = dict(
        (
            await db.execute(
                select(Exercise.id, Exercise.exercise_group_id).where(
                    Exercise.id.in_(from_ids), Exercise.teacher_id == viewer.id
                )
            )
        )
        .tuples()
        .all()
    )
    out: list[ContributionSummary] = []
    for row in rows:
        incoming = row.owner_id == viewer.id
        # Derived from the author's current rows, so only the author gets it.
        st = (
            await contrib.staleness(row, db)
            if incoming and row.status == "pending"
            else contrib.Staleness(False, False)
        )
        out.append(
            ContributionSummary(
                id=row.id,
                direction="incoming" if incoming else "outgoing",
                exercise_name=names.get(row.source_group_id),
                kind=row.kind,  # type: ignore[arg-type]
                variant_key=row.variant_key,
                message=row.message,
                status=row.status,  # type: ignore[arg-type]
                decision_note=row.decision_note,
                created_at=row.created_at,
                decided_at=row.decided_at,
                counterpart_email=emails.get(row.contributor_id if incoming else row.owner_id),
                stale=st.stale,
                target_gone=st.target_gone,
                result_exercise_id=row.result_exercise_id,
                library_group_id=(
                    row.source_group_id
                    if incoming
                    else copy_groups.get(row.from_exercise_id) if row.from_exercise_id else None
                ),
            )
        )
    return out


@router.get("", response_model=list[ContributionSummary])
async def list_contributions(
    direction: Literal["incoming", "outgoing"] = Query(default="incoming"),
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> list[ContributionSummary]:
    """Proposals to the caller's exercises (incoming) or from the caller (outgoing)."""
    column = (
        ExerciseContribution.owner_id
        if direction == "incoming"
        else ExerciseContribution.contributor_id
    )
    rows = (
        await db.execute(
            select(ExerciseContribution)
            .where(column == teacher.id)
            .order_by(ExerciseContribution.created_at.desc())
            .limit(200)
        )
    ).scalars().all()
    return await _summaries(rows, teacher, db)


@router.get("/summary", response_model=ContributionCount)
async def contribution_count(
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> ContributionCount:
    """Pending proposals: the incoming total (tab badge) and per own group (library tag)."""
    pending = ExerciseContribution.status == "pending"
    incoming = (
        await db.execute(
            select(ExerciseContribution.source_group_id, func.count())
            .where(ExerciseContribution.owner_id == teacher.id, pending)
            .group_by(ExerciseContribution.source_group_id)
        )
    ).tuples().all()
    outgoing = (
        await db.execute(
            select(Exercise.exercise_group_id, func.count())
            .select_from(ExerciseContribution)
            .join(Exercise, Exercise.id == ExerciseContribution.from_exercise_id)
            .where(
                ExerciseContribution.contributor_id == teacher.id,
                Exercise.teacher_id == teacher.id,
                Exercise.exercise_group_id.is_not(None),
                pending,
            )
            .group_by(Exercise.exercise_group_id)
        )
    ).tuples().all()
    by_group: dict[uuid.UUID, PendingForGroup] = {}
    for gid, n in incoming:
        by_group.setdefault(gid, PendingForGroup(group_id=gid)).incoming = n
    for copy_gid, n in outgoing:
        if copy_gid is not None:
            by_group.setdefault(copy_gid, PendingForGroup(group_id=copy_gid)).outgoing = n
    return ContributionCount(
        incoming_pending=sum(n for _gid, n in incoming), pending_by_group=list(by_group.values())
    )


@router.get("/{contribution_id}", response_model=ContributionDetail)
async def get_contribution(
    contribution_id: uuid.UUID,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> ContributionDetail:
    """The proposal; the owner also gets the current row it applies to and a file comparison."""
    row = await contrib.load_for(teacher, contribution_id, db)
    (summary,) = await _summaries([row], teacher, db)
    files = list(
        (
            await db.execute(
                select(ExerciseContributionResource).where(
                    ExerciseContributionResource.contribution_id == row.id
                )
            )
        ).scalars()
    )
    base = None
    base_files: dict[str, str] = {}
    if row.owner_id == teacher.id and row.status == "pending":
        base = await contrib.resolve_base(row, db)
        if base is not None:
            digests = await resource_digests([base.id], db)
            base_files = {name: sha for name, _mime, sha in digests.get(base.id, [])}
    out: list[ContributionFile] = []
    for f in files:
        old = base_files.get(f.filename)
        change: Literal["added", "changed", "unchanged"] = (
            "added" if old is None else "unchanged" if old == f.content_sha256 else "changed"
        )
        out.append(ContributionFile(filename=f.filename, change=change, resource_id=f.id))
    proposed = {f.filename for f in files}
    out.extend(
        ContributionFile(filename=name, change="removed")
        for name in sorted(base_files)
        if name not in proposed
    )
    return ContributionDetail(
        **summary.model_dump(),
        latex_body=row.latex_body,
        question_type=row.question_type,
        correct_answers=row.correct_answers,
        max_points=row.max_points,
        penalty=row.penalty,
        base=_to_res(base) if base is not None else None,
        files=out,
    )


@router.get("/{contribution_id}/resources/{resource_id}")
async def download_contribution_resource(
    contribution_id: uuid.UUID,
    resource_id: uuid.UUID,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """A proposed file, for the owner and the contributor only; served like exercise resources."""
    row = await contrib.load_for(teacher, contribution_id, db)
    file = await db.get(ExerciseContributionResource, resource_id)
    if file is None or file.contribution_id != row.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")
    return resource_response(file.content, file.mime_type, file.filename)


@router.post("/{contribution_id}/accept", response_model=ContributionSummary)
async def accept_contribution(
    request: Request,
    contribution_id: uuid.UUID,
    body: ContributionAccept,
    teacher: Teacher = Depends(require_exercise_sharing),
    db: AsyncSession = Depends(get_db),
) -> ContributionSummary:
    """Adopt a proposal as a new version (or a new variant at version 1); the owner may edit it.
    Nothing is updated in place, so the owner's exams keep the rows they link."""
    await contrib.accept(
        teacher,
        contribution_id,
        db,
        latex_override=body.latex_body,
        as_variant=body.as_variant,
        variant_key=body.variant_key,
    )
    await audit_svc.log(db, request, teacher, "CONTRIBUTION_ACCEPTED", contribution_id)
    row = await contrib.load_for(teacher, contribution_id, db, refresh=True)
    (summary,) = await _summaries([row], teacher, db)
    return summary


@router.post("/{contribution_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
async def reject_contribution(
    request: Request,
    contribution_id: uuid.UUID,
    body: ContributionReject,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Decline a proposal (owner); its content is dropped at once. Never gated."""
    await contrib.decide_without_merge(
        teacher, contribution_id, db, status="rejected", note=body.note
    )
    await audit_svc.log(db, request, teacher, "CONTRIBUTION_REJECTED", contribution_id)


@router.post("/{contribution_id}/withdraw", status_code=status.HTTP_204_NO_CONTENT)
async def withdraw_contribution(
    request: Request,
    contribution_id: uuid.UUID,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Take back an own pending proposal; its content is dropped at once. Never gated."""
    await contrib.decide_without_merge(teacher, contribution_id, db, status="withdrawn")
    await audit_svc.log(db, request, teacher, "CONTRIBUTION_WITHDRAWN", contribution_id)
