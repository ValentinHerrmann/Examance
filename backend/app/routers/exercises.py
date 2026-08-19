"""Exercises library router — /api/v1/exercises/*"""
from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import (
    get_current_teacher,
    get_exercise_for_teacher,
    get_readable_exercise,
)
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
from app.schemas.resource import (
    ExerciseResourceCreate,
    ExerciseResourceRename,
    ExerciseResourceResponse,
)
from app.services.latex_resources import (
    MAX_EXERCISE_RESOURCE_BYTES,
    MAX_RESOURCE_BYTES,
    resolve_content_disposition,
)

router = APIRouter(prefix="/exercises", tags=["exercises"])


def parse_exercise_score(latex_content: str) -> float:
    """Parse max score from exercise latex content."""
    if not latex_content:
        return 0.0

    override = re.search(r"\\begin\{Aufgabe\}\[([\d.]+)\]", latex_content)
    if override:
        try:
            return float(override.group(1))
        except ValueError:
            pass

    full = len(re.findall(r"\\BE\b", latex_content))
    full += len(re.findall(r"\\Lmulti\b", latex_content))
    half = len(re.findall(r"\\hBE\b", latex_content))
    quart = len(re.findall(r"\\qBE\b", latex_content))

    return full * 1.0 + half * 0.5 + quart * 0.25


def _to_res(ex: Exercise) -> ExerciseResponse:
    return ExerciseResponse(
        id=ex.id,
        teacher_id=ex.teacher_id,
        name=ex.name,
        topic_tag=ex.topic_tag,
        grade=ex.grade,
        subject=ex.subject,
        latex_body=ex.latex_body,
        max_points=ex.max_points,
        version=ex.version,
        exercise_group_id=ex.exercise_group_id,
        variant_key=ex.variant_key,
        is_current=ex.is_current,
        order_index=ex.order_index,
        question_type=ex.question_type,
        correct_answers=ex.correct_answers,
        penalty=ex.penalty,
    )


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
    """List all exercises in the teacher's exercise library."""
    query = select(Exercise).where(
        or_(Exercise.teacher_id == teacher.id, Exercise.is_public.is_(True))
    )

    if current_only:
        query = query.where(Exercise.is_current.is_(True))

    if group_id:
        query = query.where(Exercise.exercise_group_id == group_id)

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

    query = query.order_by(Exercise.name.asc(), Exercise.version.desc())
    result = await db.execute(query)
    exercises = result.scalars().all()

    return [_to_res(ex) for ex in exercises]


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
        "latex_body": body.latex_body,
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
) -> ExerciseResponse:
    """Get an exercise from the library (own exercises or published ones)."""
    return _to_res(ex)


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
        ex.max_points = parse_exercise_score(body.latex_body)
    elif body.max_points is not None:
        ex.max_points = body.max_points
    if body.exercise_group_id is not None:
        await _require_own_group(body.exercise_group_id, teacher.id, db)
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
    # Mark old version as not current
    old_ex.is_current = False

    group_id = old_ex.exercise_group_id
    if not group_id:
        group = ExerciseGroup(
            teacher_id=teacher.id,
            name=old_ex.name or "Untitled Group",
            topic_tag=old_ex.topic_tag,
            grade=old_ex.grade,
            subject=old_ex.subject,
        )
        db.add(group)
        await db.flush()
        group_id = group.id
        old_ex.exercise_group_id = group_id
    else:
        group = await _require_own_group(group_id, teacher.id, db)

    group_name = group.name if group else old_ex.name
    group_topic = group.topic_tag if group else old_ex.topic_tag
    group_grade = group.grade if group else old_ex.grade
    group_subject = group.subject if group else old_ex.subject

    new_latex = body.latex_body if body.latex_body is not None else old_ex.latex_body
    computed_score = parse_exercise_score(new_latex) if new_latex else old_ex.max_points

    new_ex = Exercise(
        teacher_id=teacher.id,
        name=body.name if body.name is not None else group_name,
        topic_tag=body.topic_tag if body.topic_tag is not None else group_topic,
        grade=body.grade if body.grade is not None else group_grade,
        subject=body.subject if body.subject is not None else group_subject,
        latex_body=new_latex,
        max_points=computed_score,
        version=old_ex.version + 1,
        exercise_group_id=group_id,
        variant_key=body.variant_key or old_ex.variant_key,
        is_current=True,
        question_type=old_ex.question_type,
        correct_answers=old_ex.correct_answers,
        penalty=old_ex.penalty,
    )
    db.add(new_ex)
    await db.flush()
    await _copy_resources(old_ex.id, new_ex.id, db)

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
    group_id = base_ex.exercise_group_id
    if not group_id:
        group = ExerciseGroup(
            teacher_id=teacher.id,
            name=base_ex.name or "Untitled Group",
            topic_tag=base_ex.topic_tag,
            grade=base_ex.grade,
            subject=base_ex.subject,
        )
        db.add(group)
        await db.flush()
        group_id = group.id
        base_ex.exercise_group_id = group_id
    else:
        group = await _require_own_group(group_id, teacher.id, db)

    group_name = group.name if group else base_ex.name
    group_topic = group.topic_tag if group else base_ex.topic_tag
    group_grade = group.grade if group else base_ex.grade
    group_subject = group.subject if group else base_ex.subject

    computed_score = parse_exercise_score(body.latex_body) if body.latex_body else body.max_points

    variant_ex = Exercise(
        teacher_id=teacher.id,
        name=group_name,
        topic_tag=group_topic,
        grade=group_grade,
        subject=group_subject,
        latex_body=body.latex_body,
        max_points=computed_score,
        version=1,
        exercise_group_id=group_id,
        variant_key=body.variant_key,
        is_current=True,
        question_type=base_ex.question_type,
        correct_answers=base_ex.correct_answers,
        penalty=base_ex.penalty,
    )
    db.add(variant_ex)
    await db.flush()
    await _copy_resources(base_ex.id, variant_ex.id, db)

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
    Delete an exercise from the caller's own library.

    Idempotent: always 204, whether or not a row was removed. Only exercises
    owned by *teacher* are ever deleted, so a foreign id is a silent no-op —
    which also keeps the response from revealing that the id exists.
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



# --- Resource files -------------------------------------------------------
#
# Files a teacher attaches to an exercise so its LaTeX can reference them
# (\includegraphics{figure.png}, \input{data.tex}, ...). Bytes are stored in
# plaintext, exactly like latex_body; the zero-knowledge path is all-local
# mode, where they never leave the browser. See docs/data_flow_and_security.md.


async def _copy_resources(source_id: uuid.UUID, target_id: uuid.UUID, db: AsyncSession) -> None:
    """Duplicate every resource of *source_id* onto *target_id*.

    A new version or variant is a separate exercise row, and its LaTeX still
    references the same figures — so the files travel with it.
    """
    rows = (
        (
            await db.execute(
                select(ExerciseResource).where(ExerciseResource.exercise_id == source_id)
            )
        )
        .scalars()
        .all()
    )
    for row in rows:
        db.add(
            ExerciseResource(
                exercise_id=target_id,
                filename=row.filename,
                mime_type=row.mime_type,
                byte_size=row.byte_size,
                content=row.content,
            )
        )
    if rows:
        await db.flush()


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
        await db.flush()
        updated: ExerciseResourceResponse = ExerciseResourceResponse.model_validate(replaced)
        return updated

    row = ExerciseResource(
        exercise_id=ex.id,
        filename=body.filename,
        mime_type=body.mime_type,
        byte_size=len(content),
        content=content,
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
    """
    Return a resource's raw bytes.

    Only png/jpeg/pdf are served under their own media type; anything else is
    an opaque download. A stored text/html file returned inline from the API
    origin would be stored XSS, so the type is never taken at face value and
    sniffing is disabled.
    """
    row = await _get_resource(ex.id, resource_id, db)
    media_type, disposition = resolve_content_disposition(row.mime_type)
    return Response(
        content=row.content,
        media_type=media_type,
        headers={
            "Content-Disposition": f'{disposition}; filename="{row.filename}"',
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "sandbox; default-src 'none'",
        },
    )


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
