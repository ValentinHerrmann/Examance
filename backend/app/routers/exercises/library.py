"""The teacher's own exercise library: list, create, edit, versions, variants, delete."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import (
    DB,
    CurrentTeacher,
    OwnExercise,
    get_current_teacher,
    get_exercise_for_teacher,
    get_readable_exercise,
)
from app.models.exam import Exam
from app.models.exam_exercise import ExamExercise
from app.models.exercise import Exercise
from app.models.exercise_group import ExerciseGroup
from app.models.teacher import Teacher
from app.schemas.exam import (
    ExamUsageItem,
    ExerciseCreate,
    ExerciseGroupResponse,
    ExerciseGroupUpdate,
    ExerciseResponse,
    ExerciseUpdate,
    ExerciseUsageResponse,
)
from app.services import exercise_sharing as sharing
from app.services.exercise_library import (
    cascade_group_metadata,
    filtered,
    get_own_group,
    group_of,
    metadata_changes,
)
from app.services.latex_score import parse_exercise_score

# `listing` is registered before the sharing catalog (`/shared`, `/sync-status`), `router` after it: FastAPI matches overlapping paths in registration order (see `__init__`).
listing = APIRouter()
router = APIRouter()

#: Columns `PATCH /exercises/{id}` copies as sent; a null keeps the stored value.
_PLAIN_UPDATE_FIELDS = {
    "name",
    "topic_tag",
    "grade",
    "subject",
    "latex_body",
    "variant_key",
    "question_type",
    "correct_answers",
    "penalty",
}


async def _lock_current(ex: Exercise, teacher: Teacher, db: AsyncSession) -> ExerciseGroup:
    """The group of *ex* under its row lock, with *ex* re-read inside it: of two concurrent writers only the first still finds *ex* current, so a variant never gets two current rows."""
    if ex.exercise_group_id is not None:
        group = await get_own_group(ex.exercise_group_id, teacher.id, db, lock=True)
        await db.refresh(ex)
    else:
        group = await group_of(ex, teacher, db)
    if not ex.is_current:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only the current version of an exercise can be extended.",
            headers={"code": "ERR_EXERCISE_NOT_CURRENT"},
        )
    return group


@listing.get("")
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
    """List the teacher's own library. Shared rows are listed by `/shared` and only ever copied, so the library, the exam picker and the offline mirror never hold another account's row."""
    query = select(Exercise).where(Exercise.teacher_id == teacher.id)
    if current_only:
        query = query.where(Exercise.is_current.is_(True))
    if group_id:
        query = query.where(Exercise.exercise_group_id == group_id)
    query = filtered(query, topic_tag, grade, subject, search)
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
    return [
        ExerciseResponse.from_exercise(ex, group_copied=ex.exercise_group_id in copied)
        for ex in rows
    ]


@router.patch("/groups/{group_id}")
async def update_exercise_group(
    group_id: uuid.UUID,
    body: ExerciseGroupUpdate,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> ExerciseGroupResponse:
    """Update group metadata and cascade it to every member variant."""
    group = await get_own_group(group_id, teacher.id, db)
    await cascade_group_metadata(group_id, teacher.id, metadata_changes(body), db)
    await db.flush()
    return ExerciseGroupResponse.model_validate(group, from_attributes=True)


@router.post("", status_code=status.HTTP_201_CREATED)
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
        group = await get_own_group(group_id, teacher.id, db)
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
    # See create_exam: a client-chosen id collision is a 409, never a 500 that would reveal that the id is already taken (possibly by another teacher).
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An exercise with this id already exists.",
        ) from None

    return ExerciseResponse.from_exercise(ex)


@router.get("/{exercise_id}")
async def get_exercise(
    ex: Exercise = Depends(get_readable_exercise),
    teacher: Teacher = Depends(get_current_teacher),
) -> ExerciseResponse:
    """Get an own exercise, or one shared with the caller (then without owner id or provenance, so `teacher_id` tells the caller whether the row is theirs)."""
    res = ExerciseResponse.from_exercise(ex)
    if ex.teacher_id != teacher.id:
        res.teacher_id = None
        res.copied_from_exercise_id = None
    return res


async def _move_to_group(ex: Exercise, group_id: uuid.UUID, teacher: Teacher, db: AsyncSession) -> None:
    """Move *ex* into the teacher's own group; a copy stays a copy, so the target can no longer be shared as one's own."""
    target = await get_own_group(group_id, teacher.id, db)
    old = await db.get(ExerciseGroup, ex.exercise_group_id) if ex.exercise_group_id else None
    if target.copied_at is None and (ex.copied_from_exercise_id is not None or (old is not None and old.copied_at)):
        target.copied_at = datetime.now(UTC)
    ex.exercise_group_id = group_id


@router.patch("/{exercise_id}")
async def update_exercise(
    body: ExerciseUpdate, ex: OwnExercise, teacher: CurrentTeacher, db: DB
) -> ExerciseResponse:
    """Update a library exercise in place."""
    sent = body.model_dump(exclude_unset=True, include=_PLAIN_UPDATE_FIELDS)
    for name, value in sent.items():
        if value is not None:
            setattr(ex, name, value)
    # Points follow the LaTeX only when there is some: an empty body used to reset max_points to 0, which zeroed every score scale of an exercise saved without code.
    if body.latex_body:
        ex.max_points = parse_exercise_score(body.latex_body)
    elif body.max_points is not None:
        ex.max_points = body.max_points
    if body.exercise_group_id is not None and body.exercise_group_id != ex.exercise_group_id:
        await _move_to_group(ex, body.exercise_group_id, teacher, db)

    changes = metadata_changes(body)
    if ex.exercise_group_id and changes:
        await cascade_group_metadata(ex.exercise_group_id, teacher.id, changes, db)

    await db.flush()
    return ExerciseResponse.from_exercise(ex)


@router.post(
    "/{exercise_id}/new-version",
    status_code=status.HTTP_201_CREATED,
)
async def create_new_version(
    body: ExerciseUpdate,
    old_ex: Exercise = Depends(get_exercise_for_teacher),
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> ExerciseResponse:
    """Create a new corrected version of an existing exercise (archives previous version)."""
    group = await _lock_current(old_ex, teacher, db)
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

    return ExerciseResponse.from_exercise(new_ex)


@router.post(
    "/{exercise_id}/new-variant",
    status_code=status.HTTP_201_CREATED,
)
async def create_new_variant(
    body: ExerciseCreate,
    base_ex: Exercise = Depends(get_exercise_for_teacher),
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> ExerciseResponse:
    """Create a new parallel variant (e.g. Möbel/Fahrzeug/Wildtier) under the same group."""
    group = await _lock_current(base_ex, teacher, db)
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

    return ExerciseResponse.from_exercise(variant_ex)


@router.get("/{exercise_id}/usage")
async def get_exercise_usage(
    ex: Exercise = Depends(get_readable_exercise),
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> ExerciseUsageResponse:
    """Get count and details of non-deleted exams referencing this exercise. Only the caller's own exams are reported, so usage of a published exercise in another teacher's exam is never disclosed."""
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


async def _previous_version(
    ex: Exercise, teacher: Teacher, db: AsyncSession
) -> Exercise | None:
    """The newest older version of *ex*'s variant, unless the variant already has another current row (then nothing needs promoting)."""
    rows = (
        await db.execute(
            select(Exercise)
            .where(
                Exercise.teacher_id == teacher.id,
                Exercise.exercise_group_id == ex.exercise_group_id,
                Exercise.variant_key.is_(None)
                if ex.variant_key is None
                else Exercise.variant_key == ex.variant_key,
                Exercise.id != ex.id,
            )
            .order_by(Exercise.version.desc())
        )
    ).scalars().all()
    if any(r.is_current for r in rows):
        return None
    return rows[0] if rows else None


@router.delete("/{exercise_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exercise(
    exercise_id: uuid.UUID,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete an exercise from the caller's own library. Idempotent: always 204. Only exercises owned by *teacher* are deleted, so a foreign id is a silent no-op that does not reveal the id exists."""
    result = await db.execute(
        select(Exercise).where(
            Exercise.id == exercise_id,
            Exercise.teacher_id == teacher.id,
        )
    )
    ex = result.scalar_one_or_none()
    if ex is None:
        return
    if ex.exercise_group_id is not None and ex.is_current:
        # Under the group lock, so a concurrent new version cannot leave two current rows.
        await get_own_group(ex.exercise_group_id, teacher.id, db, lock=True)
        previous = await _previous_version(ex, teacher, db)
        if previous is not None:
            previous.is_current = True
    await db.delete(ex)
