"""Exercises library router — /api/v1/exercises/*"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    Response,
    status,
)
from sqlalchemy import Select, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import (
    get_current_teacher,
    get_exercise_for_teacher,
    get_readable_exercise,
    get_teaching_teacher,
)
from app.middleware.rate_limit import limiter
from app.models.exam import Exam
from app.models.exam_exercise import ExamExercise
from app.models.exercise import Exercise
from app.models.exercise_group import ExerciseGroup
from app.models.exercise_resource import ExerciseResource
from app.models.teacher import Teacher
from app.schemas.binary import decode_b64
from app.schemas.exam import (
    ExamUsageItem,
    ExerciseCreate,
    ExerciseGroupResponse,
    ExerciseGroupUpdate,
    ExerciseResponse,
    ExerciseUpdate,
    ExerciseUsageResponse,
)
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
from app.schemas.resource import (
    ExerciseResourceCreate,
    ExerciseResourceRename,
    ExerciseResourceResponse,
)
from app.services import account_mail
from app.services import audit as audit_svc
from app.services import exercise_contributions as contributions
from app.services import exercise_sharing as sharing
from app.services.capabilities import ensure_exercise_sharing, require_exercise_sharing
from app.services.latex_resources import (
    MAX_EXERCISE_RESOURCE_BYTES,
    MAX_RESOURCE_BYTES,
    resource_response,
)
from app.services.latex_score import parse_exercise_score

router = APIRouter(
    prefix="/exercises",
    tags=["exercises"],
    dependencies=[Depends(get_teaching_teacher)],
)


def _to_res(ex: Exercise) -> ExerciseResponse:
    return ExerciseResponse(
        id=ex.id,
        teacher_id=ex.teacher_id,
        name=ex.name,
        topic_tag=ex.topic_tag,
        grade=ex.grade,
        subject=ex.subject,
        latex_body=ex.latex_body,
        code_withheld=ex.code_withheld,
        max_points=ex.max_points,
        version=ex.version,
        exercise_group_id=ex.exercise_group_id,
        variant_key=ex.variant_key,
        is_current=ex.is_current,
        order_index=ex.order_index,
        question_type=ex.question_type,
        correct_answers=ex.correct_answers,
        penalty=ex.penalty,
        is_shared=ex.is_public,
        shared_at=ex.shared_at,
        copied_from_exercise_id=ex.copied_from_exercise_id,
    )


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
    return {tid: email for tid, email in res.tuples().all()}


async def _require_own_group(
    group_id: uuid.UUID, teacher_id: uuid.UUID, db: AsyncSession
) -> ExerciseGroup:
    """Return the group only if *teacher_id* owns it, else 404."""
    res = await db.execute(
        select(ExerciseGroup).where(
            ExerciseGroup.id == group_id,
            ExerciseGroup.teacher_id == teacher_id,
        )
    )
    group = res.scalar_one_or_none()
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Exercise group not found"
        )
    return group


async def _group_of(ex: Exercise, teacher: Teacher, db: AsyncSession) -> ExerciseGroup:
    """The own group of *ex*, created (and *ex* moved into it) for a loose exercise."""
    if ex.exercise_group_id is not None:
        return await _require_own_group(ex.exercise_group_id, teacher.id, db)
    group = ExerciseGroup(
        teacher_id=teacher.id,
        name=ex.name or "Untitled Group",
        topic_tag=ex.topic_tag,
        grade=ex.grade,
        subject=ex.subject,
    )
    db.add(group)
    await db.flush()
    ex.exercise_group_id = group.id
    return group


def _filtered[*Ts](
    query: Select[*Ts],
    topic_tag: str | None,
    grade: str | None,
    subject: str | None,
    search: str | None,
) -> Select[*Ts]:
    if topic_tag:
        query = query.where(Exercise.topic_tag == topic_tag)
    if grade:
        query = query.where(Exercise.grade == grade)
    if subject:
        query = query.where(Exercise.subject == subject)
    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            or_(
                Exercise.name.ilike(search_pattern),
                Exercise.latex_body.ilike(search_pattern),
                Exercise.topic_tag.ilike(search_pattern),
                Exercise.grade.ilike(search_pattern),
                Exercise.subject.ilike(search_pattern),
                Exercise.variant_key.ilike(search_pattern),
            )
        )
    return query


@router.get("", response_model=list[ExerciseResponse])
async def list_exercises(
    topic_tag: str | None = None,
    grade: str | None = None,
    subject: str | None = None,
    search: str | None = None,
    group_id: uuid.UUID | None = None,
    current_only: bool = True,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> list[ExerciseResponse]:
    """List the teacher's own library. Shared rows are listed by `/shared` and only ever copied,
    so the library, the exam picker and the offline mirror never hold another account's row."""
    query = select(Exercise).where(Exercise.teacher_id == teacher.id)
    if current_only:
        query = query.where(Exercise.is_current.is_(True))
    if group_id:
        query = query.where(Exercise.exercise_group_id == group_id)
    query = _filtered(query, topic_tag, grade, subject, search)
    query = query.order_by(Exercise.name.asc(), Exercise.version.desc())
    rows = (await db.execute(query)).scalars().all()
    copied = set(
        (
            await db.execute(
                select(ExerciseGroup.id).where(
                    ExerciseGroup.teacher_id == teacher.id, ExerciseGroup.copied_at.is_not(None)
                )
            )
        ).scalars()
    )
    out = []
    for ex in rows:
        res = _to_res(ex)
        res.group_copied = ex.exercise_group_id in copied
        out.append(res)
    return out


@router.get("/shared", response_model=list[SharedExerciseResponse])
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
    query = _filtered(query, topic_tag, grade, subject, search)
    query = query.order_by(
        Exercise.name.asc(),
        Exercise.exercise_group_id.asc(),
        Exercise.variant_key.asc(),
        Exercise.id.asc(),  # unique tiebreak: offset paging must not skip or repeat rows
    )
    rows = (await db.execute(query.limit(limit).offset(offset))).tuples().all()
    return [_to_shared_res(ex, email) for ex, email in rows]


@router.get("/sync-status", response_model=list[SyncStatusItem])
async def get_sync_status(
    teacher: Teacher = Depends(require_exercise_sharing),
    db: AsyncSession = Depends(get_db),
) -> list[SyncStatusItem]:
    """For each own group copied from a shared one: whether the source changed since the last
    sync. "source_unavailable" does not tell unshared from deleted, on purpose."""
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


@router.patch("/groups/{group_id}", response_model=ExerciseGroupResponse)
async def update_exercise_group(
    group_id: uuid.UUID,
    body: ExerciseGroupUpdate,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> ExerciseGroupResponse:
    """Update group metadata and cascade it to every member variant."""
    res = await db.execute(
        select(ExerciseGroup).where(
            ExerciseGroup.id == group_id,
            ExerciseGroup.teacher_id == teacher.id,
        )
    )
    group = res.scalar_one_or_none()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Exercise group not found"
        )

    if body.name is not None:
        group.name = body.name
    if body.topic_tag is not None:
        group.topic_tag = body.topic_tag
    if body.grade is not None:
        group.grade = body.grade
    if body.subject is not None:
        group.subject = body.subject

    # Cascade changes to all exercises in group — scoped to the owner so a shared
    # group id can never reach another teacher's rows.
    ex_res = await db.execute(
        select(Exercise).where(
            Exercise.exercise_group_id == group_id,
            Exercise.teacher_id == teacher.id,
        )
    )
    for ex in ex_res.scalars().all():
        if body.name is not None:
            ex.name = body.name
        if body.topic_tag is not None:
            ex.topic_tag = body.topic_tag
        if body.grade is not None:
            ex.grade = body.grade
        if body.subject is not None:
            ex.subject = body.subject

    await db.flush()
    return ExerciseGroupResponse(
        id=group.id,
        teacher_id=group.teacher_id,
        name=group.name,
        topic_tag=group.topic_tag,
        grade=group.grade,
        subject=group.subject,
        created_at=group.created_at,
        source_group_id=group.source_group_id,
    )


@router.post("", response_model=ExerciseResponse, status_code=status.HTTP_201_CREATED)
async def create_exercise(
    body: ExerciseCreate,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> ExerciseResponse:
    """Create a new exercise in the teacher's library."""
    computed_score = parse_exercise_score(body.latex_body) if body.latex_body else body.max_points

    group_id = body.exercise_group_id
    group_name = body.name or "Untitled Group"
    group_topic = body.topic_tag
    group_grade = body.grade
    group_subject = body.subject

    if not group_id:
        group = ExerciseGroup(
            teacher_id=teacher.id,
            name=group_name,
            topic_tag=group_topic,
            grade=group_grade,
            subject=group_subject,
        )
        db.add(group)
        await db.flush()
        group_id = group.id
    else:
        group = await _require_own_group(group_id, teacher.id, db)
        group_name = group.name
        group_topic = group.topic_tag
        group_grade = group.grade
        group_subject = group.subject

    kwargs = {
        "teacher_id": teacher.id,
        "name": group_name,
        "topic_tag": group_topic,
        "grade": group_grade,
        "subject": group_subject,
        "latex_body": None if body.code_withheld else body.latex_body,
        "code_withheld": body.code_withheld,
        "max_points": computed_score,
        "version": 1,
        "exercise_group_id": group_id,
        "variant_key": body.variant_key,
        "is_current": True,
        "question_type": body.question_type,
        "correct_answers": body.correct_answers,
        "penalty": body.penalty,
    }
    if body.id:
        kwargs["id"] = body.id
    ex = Exercise(**kwargs)
    db.add(ex)
    # See create_exam: a client-chosen id collision is a 409, never a 500 that
    # would reveal that the id is already taken (possibly by another teacher).
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An exercise with this id already exists.",
        ) from None

    return _to_res(ex)


@router.get("/{exercise_id}", response_model=ExerciseResponse)
async def get_exercise(
    ex: Exercise = Depends(get_readable_exercise),
    teacher: Teacher = Depends(get_current_teacher),
) -> ExerciseResponse:
    """Get an own exercise, or one shared with the caller (then without owner id or provenance,
    so `teacher_id` tells the caller whether the row is theirs)."""
    res = _to_res(ex)
    if ex.teacher_id != teacher.id:
        res.teacher_id = None
        res.copied_from_exercise_id = None
    return res


@router.patch("/{exercise_id}", response_model=ExerciseResponse)
async def update_exercise(
    body: ExerciseUpdate,
    ex: Exercise = Depends(get_exercise_for_teacher),
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> ExerciseResponse:
    """Update a library exercise in place."""
    if body.name is not None:
        ex.name = body.name
    if body.topic_tag is not None:
        ex.topic_tag = body.topic_tag
    if body.grade is not None:
        ex.grade = body.grade
    if body.subject is not None:
        ex.subject = body.subject
    if body.latex_body is not None:
        ex.latex_body = body.latex_body
    # Points follow the LaTeX only when there is some: an empty body used to reset max_points
    # to 0, which zeroed every score scale of an exercise saved without code.
    if body.latex_body:
        ex.max_points = parse_exercise_score(body.latex_body)
    elif body.max_points is not None:
        ex.max_points = body.max_points
    if body.exercise_group_id is not None and body.exercise_group_id != ex.exercise_group_id:
        target = await _require_own_group(body.exercise_group_id, teacher.id, db)
        # A copy stays a copy when moved: the target group can no longer be shared as one's own.
        old = await db.get(ExerciseGroup, ex.exercise_group_id) if ex.exercise_group_id else None
        if target.copied_at is None and (
            ex.copied_from_exercise_id is not None or (old is not None and old.copied_at)
        ):
            target.copied_at = datetime.now(UTC)
        ex.exercise_group_id = body.exercise_group_id
    if body.variant_key is not None:
        ex.variant_key = body.variant_key
    if body.question_type is not None:
        ex.question_type = body.question_type
    if body.correct_answers is not None:
        ex.correct_answers = body.correct_answers
    if body.penalty is not None:
        ex.penalty = body.penalty

    # Cascade group metadata changes if exercise belongs to a group
    if ex.exercise_group_id and (
        body.name is not None
        or body.topic_tag is not None
        or body.grade is not None
        or body.subject is not None
    ):
        group_res = await db.execute(
            select(ExerciseGroup).where(
                ExerciseGroup.id == ex.exercise_group_id,
                ExerciseGroup.teacher_id == teacher.id,
            )
        )
        group = group_res.scalar_one_or_none()
        if group:
            if body.name is not None:
                group.name = body.name
            if body.topic_tag is not None:
                group.topic_tag = body.topic_tag
            if body.grade is not None:
                group.grade = body.grade
            if body.subject is not None:
                group.subject = body.subject

        # Cascade to all exercise variants in group — owner-scoped
        ex_res = await db.execute(
            select(Exercise).where(
                Exercise.exercise_group_id == ex.exercise_group_id,
                Exercise.teacher_id == teacher.id,
            )
        )
        for sister in ex_res.scalars().all():
            if body.name is not None:
                sister.name = body.name
            if body.topic_tag is not None:
                sister.topic_tag = body.topic_tag
            if body.grade is not None:
                sister.grade = body.grade
            if body.subject is not None:
                sister.subject = body.subject

    await db.flush()
    return _to_res(ex)


@router.post(
    "/{exercise_id}/new-version",
    response_model=ExerciseResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_new_version(
    body: ExerciseUpdate,
    old_ex: Exercise = Depends(get_exercise_for_teacher),
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> ExerciseResponse:
    """Create a new corrected version of an existing exercise (archives previous version)."""
    group = await _group_of(old_ex, teacher, db)
    new_latex = body.latex_body if body.latex_body is not None else old_ex.latex_body
    computed_score = parse_exercise_score(new_latex) if new_latex else old_ex.max_points
    # Absent fields keep the old version's value; an explicit null clears the answer key.
    answer_fields: dict[str, object] = {}
    if body.question_type is not None:
        answer_fields["question_type"] = body.question_type
    if "correct_answers" in body.model_fields_set:
        answer_fields["correct_answers"] = body.correct_answers
    if body.penalty is not None:
        answer_fields["penalty"] = body.penalty

    # One versioning path (shared with resync): share state and copy provenance carry over.
    new_ex = sharing.next_version(
        old_ex,
        name=body.name if body.name is not None else group.name,
        topic_tag=body.topic_tag if body.topic_tag is not None else group.topic_tag,
        grade=body.grade if body.grade is not None else group.grade,
        subject=body.subject if body.subject is not None else group.subject,
        latex_body=new_latex,
        max_points=computed_score,
        variant_key=body.variant_key or old_ex.variant_key,
        **answer_fields,
    )
    db.add(new_ex)
    await db.flush()
    await sharing.copy_resources(old_ex.id, new_ex.id, db)

    return _to_res(new_ex)


@router.post(
    "/{exercise_id}/new-variant",
    response_model=ExerciseResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_new_variant(
    body: ExerciseCreate,
    base_ex: Exercise = Depends(get_exercise_for_teacher),
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> ExerciseResponse:
    """Create a new parallel variant (e.g. Möbel/Fahrzeug/Wildtier) under the same group."""
    group = await _group_of(base_ex, teacher, db)
    computed_score = parse_exercise_score(body.latex_body) if body.latex_body else body.max_points
    # New work: it joins the group's share state but has no copy provenance.
    variant_ex = sharing.new_variant_row(
        group,
        base_ex,
        latex_body=body.latex_body,
        max_points=computed_score,
        variant_key=body.variant_key,
        question_type=base_ex.question_type,
        correct_answers=base_ex.correct_answers,
        penalty=base_ex.penalty,
    )
    db.add(variant_ex)
    await db.flush()
    await sharing.copy_resources(base_ex.id, variant_ex.id, db)

    return _to_res(variant_ex)


@router.get("/{exercise_id}/usage", response_model=ExerciseUsageResponse)
async def get_exercise_usage(
    ex: Exercise = Depends(get_readable_exercise),
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> ExerciseUsageResponse:
    """
    Get count and details of non-deleted exams referencing this exercise.

    Only the caller's own exams are reported, so usage of a published exercise
    in another teacher's exam is never disclosed.
    """
    query = (
        select(Exam)
        .join(ExamExercise, ExamExercise.exam_id == Exam.id)
        .where(
            ExamExercise.exercise_id == ex.id,
            Exam.deleted_at.is_(None),
            Exam.teacher_id == teacher.id,
        )
    )
    res = await db.execute(query)
    exams = list(res.scalars().all())

    if ex.exam_id and not any(e.id == ex.exam_id for e in exams):
        legacy_res = await db.execute(
            select(Exam).where(
                Exam.id == ex.exam_id,
                Exam.deleted_at.is_(None),
                Exam.teacher_id == teacher.id,
            )
        )
        legacy_exam = legacy_res.scalar_one_or_none()
        if legacy_exam:
            exams.append(legacy_exam)

    usage_items = [
        ExamUsageItem(id=exam.id, title=exam.title, datum=exam.datum)
        for exam in exams
    ]
    return ExerciseUsageResponse(exam_count=len(usage_items), exams=usage_items)


@router.delete("/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exercise(
    exercise_id: uuid.UUID,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Delete an exercise from the caller's own library. Idempotent: always 204.
    Only exercises owned by *teacher* are deleted, so a foreign id is a silent no-op that
    does not reveal the id exists.
    """
    result = await db.execute(
        select(Exercise).where(
            Exercise.id == exercise_id,
            Exercise.teacher_id == teacher.id,
        )
    )
    ex = result.scalar_one_or_none()
    if ex is not None:
        await db.delete(ex)



# --- Sharing (issue #65) ---------------------------------------------------
#
# Visibility is decided only in app/services/exercise_sharing.py. Shared rows are read-only for
# everyone but their owner and are only ever copied; a copy stays linked to its source for resync.


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


@router.put("/{exercise_id}/sharing", response_model=list[ExerciseResponse])
async def set_exercise_sharing(
    request: Request,
    body: ExerciseSharingUpdate,
    ex: Exercise = Depends(get_exercise_for_teacher),
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> list[ExerciseResponse]:
    """Share an own exercise group (all its variants) with every account, or stop sharing it.
    Stopping is never gated, so a revoked account can still withdraw; copies stay with copiers."""
    if body.shared:
        ensure_exercise_sharing(teacher)
    if ex.exam_id is not None or ex.code_withheld:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only library exercises with code can be shared.",
        )
    group = await _group_of(ex, teacher, db)
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
    return [_to_res(r) for r in rows if r.is_current]


@router.post("/sharing/bulk", response_model=BulkSharingResult)
async def set_sharing_bulk(
    request: Request,
    body: BulkSharingUpdate,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> BulkSharingResult:
    """Share or stop sharing every own library group at once. Copied groups are skipped (never
    shared as one's own); stopping is never gated."""
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
    request: Request,
    body: SharingPauseUpdate,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Hide (or show again) everything the account shares; per-group choices are kept. Pausing
    is never gated; resuming needs the sharing switch."""
    if not body.paused:
        ensure_exercise_sharing(teacher)
    teacher.sharing_paused = body.paused
    action = "EXERCISE_SHARING_PAUSED" if body.paused else "EXERCISE_SHARING_RESUMED"
    await audit_svc.log(db, request, teacher, action, teacher.id)
    await db.flush()


@router.post(
    "/{exercise_id}/copy", response_model=CopyResponse, status_code=status.HTTP_201_CREATED
)
@limiter.limit("60/hour")
async def copy_shared_exercise(
    request: Request,
    exercise_id: uuid.UUID,
    teacher: Teacher = Depends(require_exercise_sharing),
    db: AsyncSession = Depends(get_db),
) -> CopyResponse:
    """Copy a shared exercise group into the caller's library as a new private group that stays
    linked to its source. 404 for anything not shared with the caller, existing or not."""
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
    return CopyResponse(group_id=group.id, exercises=[_to_res(r) for r in rows])


@router.get("/groups/{group_id}/resync-preview", response_model=ResyncPreviewResponse)
async def resync_preview(
    group_id: uuid.UUID,
    teacher: Teacher = Depends(require_exercise_sharing),
    db: AsyncSession = Depends(get_db),
) -> ResyncPreviewResponse:
    """Per variant of a copied group: own current row, source current row and the source
    fingerprint the resync request must echo."""
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
                own=_to_res(v.own) if v.own else None,
            )
            for v in plan.variants
        ],
    )


@router.post("/groups/{group_id}/resync", response_model=list[ExerciseResponse])
@limiter.limit("60/hour")
async def resync_group(
    request: Request,
    group_id: uuid.UUID,
    body: ResyncRequest,
    teacher: Teacher = Depends(require_exercise_sharing),
    db: AsyncSession = Depends(get_db),
) -> list[ExerciseResponse]:
    """Bring a copied group up to its source: changed variants become new versions (the old row
    stays for the exams that link it), new source variants new rows. 409 if the source changed
    since the reviewed preview."""
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
    return [_to_res(r) for r in created]


@router.post(
    "/groups/{group_id}/contributions",
    response_model=list[uuid.UUID],
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
    """Propose variants of a linked copy to the original's author: changed ones as new versions,
    ones added to the copy as new variants. The author is notified and decides."""
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
    group = await _require_own_group(group_id, teacher.id, db)
    group.source_group_id = None
    await db.flush()


# --- Resource files -------------------------------------------------------
# Files attached to an exercise so its LaTeX can reference them (\includegraphics, \input).
# Stored in plaintext, exactly like latex_body; see docs/data_flow_and_security.md.


async def _get_resource(
    exercise_id: uuid.UUID, resource_id: uuid.UUID, db: AsyncSession
) -> ExerciseResource:
    result = await db.execute(
        select(ExerciseResource).where(
            ExerciseResource.id == resource_id,
            ExerciseResource.exercise_id == exercise_id,
        )
    )
    row: ExerciseResource | None = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")
    return row


@router.get("/{exercise_id}/resources", response_model=list[ExerciseResourceResponse])
async def list_exercise_resources(
    ex: Exercise = Depends(get_readable_exercise),
    db: AsyncSession = Depends(get_db),
) -> list[ExerciseResourceResponse]:
    """List an exercise's resource files (metadata only, no bytes)."""
    rows = (
        (
            await db.execute(
                select(ExerciseResource)
                .where(ExerciseResource.exercise_id == ex.id)
                .order_by(ExerciseResource.filename)
            )
        )
        .scalars()
        .all()
    )
    return [ExerciseResourceResponse.model_validate(r) for r in rows]


@router.post(
    "/{exercise_id}/resources",
    response_model=ExerciseResourceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_exercise_resource(
    body: ExerciseResourceCreate,
    ex: Exercise = Depends(get_exercise_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> ExerciseResourceResponse:
    """
    Attach a file to an exercise. Uploading an existing filename replaces it.

    The filename is sanitised and checked against the bundled LaTeX assets by
    the schema; SVG is refused there with a convert-to-PDF hint.
    """
    content = decode_b64(body.content_b64, "content_b64")
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Resource content must not be empty."
        )
    if len(content) > MAX_RESOURCE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"File exceeds the {MAX_RESOURCE_BYTES // (1024 * 1024)} MB per-file limit."
            ),
            headers={"code": "ERR_PAYLOAD_TOO_LARGE"},
        )

    existing = (
        (
            await db.execute(
                select(ExerciseResource).where(ExerciseResource.exercise_id == ex.id)
            )
        )
        .scalars()
        .all()
    )
    replaced = next((r for r in existing if r.filename == body.filename), None)
    used = sum(r.byte_size for r in existing if r is not replaced)
    if used + len(content) > MAX_EXERCISE_RESOURCE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                "This exercise's resource files would exceed the "
                f"{MAX_EXERCISE_RESOURCE_BYTES // (1024 * 1024)} MB limit."
            ),
            headers={"code": "ERR_PAYLOAD_TOO_LARGE"},
        )

    if replaced is not None:
        replaced.mime_type = body.mime_type
        replaced.byte_size = len(content)
        replaced.content = content
        replaced.content_sha256 = sharing.sha256_hex(content)
        await db.flush()
        updated: ExerciseResourceResponse = ExerciseResourceResponse.model_validate(replaced)
        return updated

    row = ExerciseResource(
        exercise_id=ex.id,
        filename=body.filename,
        mime_type=body.mime_type,
        byte_size=len(content),
        content=content,
        content_sha256=sharing.sha256_hex(content),
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A resource with this name already exists for this exercise.",
        ) from None
    created: ExerciseResourceResponse = ExerciseResourceResponse.model_validate(row)
    return created


@router.get("/{exercise_id}/resources/{resource_id}")
async def download_exercise_resource(
    resource_id: uuid.UUID,
    ex: Exercise = Depends(get_readable_exercise),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Return a resource's raw bytes (see `resource_response` for the XSS hardening)."""
    row = await _get_resource(ex.id, resource_id, db)
    return resource_response(row.content, row.mime_type, row.filename)


@router.patch("/{exercise_id}/resources/{resource_id}", response_model=ExerciseResourceResponse)
async def rename_exercise_resource(
    resource_id: uuid.UUID,
    body: ExerciseResourceRename,
    ex: Exercise = Depends(get_exercise_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> ExerciseResourceResponse:
    """Rename a resource file (the LaTeX source must be updated by the caller)."""
    row = await _get_resource(ex.id, resource_id, db)
    row.filename = body.filename
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A resource with this name already exists for this exercise.",
        ) from None
    renamed: ExerciseResourceResponse = ExerciseResourceResponse.model_validate(row)
    return renamed


@router.delete(
    "/{exercise_id}/resources/{resource_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_exercise_resource(
    resource_id: uuid.UUID,
    ex: Exercise = Depends(get_exercise_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete one resource file. Idempotent."""
    result = await db.execute(
        select(ExerciseResource).where(
            ExerciseResource.id == resource_id,
            ExerciseResource.exercise_id == ex.id,
        )
    )
    doomed: ExerciseResource | None = result.scalar_one_or_none()
    if doomed is not None:
        await db.delete(doomed)
