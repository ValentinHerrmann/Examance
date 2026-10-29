"""Exams router — /api/v1/exams/*"""
from __future__ import annotations

import copy
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_teacher, get_exam_for_teacher, get_teaching_teacher
from app.middleware.rate_limit import limiter
from app.models.exam import Exam
from app.models.exam_exercise import ExamExercise
from app.models.exam_mc_group import ExamMcGroup
from app.models.exercise import Exercise
from app.models.logo import ExamLogo
from app.models.scan_submission import ScanSubmission
from app.models.student_identity import StudentIdentity
from app.models.teacher import Teacher
from app.schemas.exam import (
    ExamCreate,
    ExamDuplicate,
    ExamResponse,
    ExamUpdate,
    ExerciseResponse,
)
from app.schemas.latex_packages import LatexPackageEntry
from app.services import audit as audit_svc
from app.services.exam_queries import (
    ExerciseRow,
    exam_response,
    exercise_response,
    fetch_exam_exercises,
    fetch_exam_mc_groups,
    fetch_exercises_for_exams,
    fetch_mc_groups_for_exams,
    load_exam_response,
)
from app.services.latex_score import parse_exercise_score
from app.services.logo import get_exam_logo

router = APIRouter(prefix="/exams", tags=["exams"], dependencies=[Depends(get_teaching_teacher)])


def _packages_column(entries: list[LatexPackageEntry] | None) -> list[dict[str, Any]] | None:
    # An empty override prints the same as none, so it is stored as "follows the account".
    return [entry.model_dump() for entry in entries] if entries else None


# Plain header columns that create, update and duplicate treat alike.
_HEADER_FIELDS = (
    "latex_template",
    "testart",
    "grade",
    "klasse",
    "datum",
    "nr",
    "fach",
    "topic",
    "lehrernachname",
    "info_text",
    "grading_key",
    "name_line",
)
# What a duplicate takes over; the title, retention and page breaks are set separately.
_COPIED_FIELDS = (*_HEADER_FIELDS, "extra_notes", "latex_packages")
# Update keeps the stored value for a null here, except `topic` (null or blank clears it).
_UPDATED_FIELDS = {"title", "retention_until", *_HEADER_FIELDS}


async def _resolve_linkable_exercise(
    exercise_id: uuid.UUID, teacher: Teacher, db: AsyncSession
) -> Exercise:
    """Load an exercise *teacher* may place into their own exam: only their own. A shared exercise is copied first (issue #65): linking another account's row would let its owner's edit or deletion cascade into this exam and its scores. Anything else raises 404."""
    res = await db.execute(
        select(Exercise).where(Exercise.id == exercise_id, Exercise.teacher_id == teacher.id)
    )
    ex = res.scalar_one_or_none()
    if ex is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Referenced exercise not found.",
        )
    return ex


def _resolve_mc_group_id(
    client_group_id: uuid.UUID | None,
    id_map: dict[uuid.UUID, uuid.UUID],
) -> uuid.UUID | None:
    """Map a client-supplied MC group id onto the group just persisted for this exam. An id that is not in *id_map* does not belong to this exam's groups and is rejected rather than stored verbatim."""
    if client_group_id is None:
        return None
    resolved = id_map.get(client_group_id)
    if resolved is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unknown mc_group_id for this exam.",
        )
    return resolved


def _dedupe_exercise_links(links: list[Any]) -> list[Any]:
    """Collapse repeated exercise_ids in an exercise_links payload. (exam_id, exercise_id) is the primary key, so a duplicate (e.g. standalone and as an MC group member) would raise an IntegrityError (500). MC group membership wins, else the first entry."""
    kept: dict[uuid.UUID, Any] = {}
    order: list[uuid.UUID] = []
    for link in links:
        existing = kept.get(link.exercise_id)
        if existing is None:
            kept[link.exercise_id] = link
            order.append(link.exercise_id)
        elif existing.mc_group_id is None and link.mc_group_id is not None:
            kept[link.exercise_id] = link
    return [kept[eid] for eid in order]


@router.get("", response_model=list[ExamResponse])
async def list_exams(
    grade: str | None = None,
    subject: str | None = None,
    search: str | None = None,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> list[ExamResponse]:
    """List all non-deleted exams belonging to the authenticated teacher."""
    query = select(Exam).where(
        Exam.teacher_id == teacher.id,
        Exam.deleted_at.is_(None),
    )

    if grade:
        query = query.where(Exam.grade == grade)

    if subject:
        query = query.where(Exam.fach == subject)

    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            or_(
                Exam.title.ilike(search_pattern),
                Exam.grade.ilike(search_pattern),
                Exam.klasse.ilike(search_pattern),
                Exam.fach.ilike(search_pattern),
                Exam.topic.ilike(search_pattern),
            )
        )

    query = query.order_by(Exam.created_at.desc())
    result = await db.execute(query)
    exams = list(result.scalars().all())

    exam_ids = [e.id for e in exams]
    exercises_by_exam = await fetch_exercises_for_exams(exam_ids, db)
    groups_by_exam = await fetch_mc_groups_for_exams(exam_ids, db)

    return [exam_response(e, exercises_by_exam[e.id], groups_by_exam[e.id]) for e in exams]


async def _persist_mc_groups(
    exam_id: uuid.UUID,
    mc_groups_data: list[Any],
    db: AsyncSession,
) -> dict[uuid.UUID, uuid.UUID]:
    """Create ExamMcGroup rows and return the {client_id: db_id} mapping. A client-supplied id is kept verbatim, like Exam.id and Exercise.id: minting a fresh one would desync the client's local (IndexedDB) group records on every write."""
    id_map: dict[uuid.UUID, uuid.UUID] = {}
    for g in mc_groups_data:
        group_id = g.id or uuid.uuid4()
        group = ExamMcGroup(
            id=group_id,
            exam_id=exam_id,
            title=g.title,
            scoring_text=g.scoring_text,
            order_index=g.order_index,
        )
        db.add(group)
        # Both directions resolve, so a payload may address a group either by the id it sent or by the id a previous response handed back.
        id_map[group_id] = group_id
        if g.id is not None:
            id_map[g.id] = group_id
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An MC group with this id already exists.",
        ) from None
    return id_map


@router.post("", response_model=ExamResponse, status_code=status.HTTP_201_CREATED)
async def create_exam(
    body: ExamCreate,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> ExamResponse:
    """Create a new exam and live-link exercises from library or inline creation."""
    kwargs = {
        **{name: getattr(body, name) for name in ("title", "retention_until", *_HEADER_FIELDS)},
        "teacher_id": teacher.id,
        "latex_packages": _packages_column(body.latex_packages),
        "page_breaks": body.page_breaks,
        "extra_notes": body.extra_notes.model_dump() if body.extra_notes else None,
    }
    if body.id:
        kwargs["id"] = body.id
    exam = Exam(**kwargs)
    db.add(exam)
    # Client-chosen ids let local-mode records keep their UUID when syncing. A collision must be a deterministic 409, not an IntegrityError surfacing as a 500 — which would distinguish "id exists" from "id is free".
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An exam with this id already exists.",
        ) from None

    # Persist MC groups first so we can map client IDs to DB IDs
    mc_group_id_map: dict[uuid.UUID, uuid.UUID] = {}
    if body.mc_groups:
        mc_group_id_map = await _persist_mc_groups(exam.id, body.mc_groups, db)

    linked_exercises: list[ExerciseRow] = []
    order = 1

    # 1. Link existing library exercises via exercise_links (mc-aware)
    if body.exercise_links:
        for link_data in _dedupe_exercise_links(body.exercise_links):
            ex = await _resolve_linkable_exercise(link_data.exercise_id, teacher, db)
            resolved_group_id = _resolve_mc_group_id(link_data.mc_group_id, mc_group_id_map)
            effective_order = link_data.order_index or order
            link = ExamExercise(
                exam_id=exam.id,
                exercise_id=ex.id,
                order_index=effective_order,
                mc_group_id=resolved_group_id,
                sub_index=link_data.sub_index,
            )
            db.add(link)
            linked_exercises.append((ex, effective_order, resolved_group_id, link_data.sub_index))
            order = effective_order + 1

    # 2. Link existing library exercise IDs (legacy, no mc info)
    elif body.exercise_ids:
        for eid in body.exercise_ids:
            ex = await _resolve_linkable_exercise(eid, teacher, db)
            link = ExamExercise(exam_id=exam.id, exercise_id=ex.id, order_index=order)
            db.add(link)
            linked_exercises.append((ex, order, None, None))
            order += 1

    # 3. Create and link inline exercises
    if body.exercises:
        for ex_data in body.exercises:
            computed_score = (
                parse_exercise_score(ex_data.latex_body)
                if ex_data.latex_body
                else ex_data.max_points
            )
            ex = Exercise(
                teacher_id=teacher.id,
                name=ex_data.name,
                topic_tag=ex_data.topic_tag,
                latex_body=None if ex_data.code_withheld else ex_data.latex_body,
                code_withheld=ex_data.code_withheld,
                max_points=computed_score,
                version=1,
                question_type=ex_data.question_type,
                correct_answers=ex_data.correct_answers,
                penalty=ex_data.penalty,
            )
            db.add(ex)
            await db.flush()

            resolved_group_id = _resolve_mc_group_id(ex_data.mc_group_id, mc_group_id_map)

            link = ExamExercise(
                exam_id=exam.id,
                exercise_id=ex.id,
                order_index=order,
                mc_group_id=resolved_group_id,
                sub_index=ex_data.sub_index,
            )
            db.add(link)
            linked_exercises.append((ex, order, resolved_group_id, ex_data.sub_index))
            order += 1

    await db.flush()
    mc_groups = await fetch_exam_mc_groups(exam.id, db)
    return exam_response(exam, linked_exercises, mc_groups)


@router.post(
    "/{exam_id}/duplicate", response_model=ExamResponse, status_code=status.HTTP_201_CREATED
)
@limiter.limit("60/hour")
async def duplicate_exam(
    request: Request,
    body: ExamDuplicate,
    source: Exam = Depends(get_exam_for_teacher),
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> ExamResponse:
    """Copy an exam's header, settings, MC groups and exercise links into a new exam (issue #121). Never copies results: students, submissions and scores belong to the source only."""
    exam = Exam(
        teacher_id=teacher.id,
        title=f"{source.title} (Kopie)"[:500],
        retention_until=body.retention_until,
        **{name: copy.deepcopy(getattr(source, name)) for name in _COPIED_FIELDS},
    )
    db.add(exam)
    await db.flush()

    group_map: dict[uuid.UUID, uuid.UUID] = {}
    for g in await fetch_exam_mc_groups(source.id, db):
        new_group = ExamMcGroup(
            exam_id=exam.id, title=g.title, scoring_text=g.scoring_text, order_index=g.order_index
        )
        db.add(new_group)
        await db.flush()
        group_map[g.id] = new_group.id

    # Page breaks name exercise or MC-group ids, so they follow every id that changes.
    item_map: dict[str, str] = {str(old): str(new) for old, new in group_map.items()}
    for ex, order, gid, sidx in await fetch_exam_exercises(source.id, db):
        if ex.exam_id is not None:
            legacy_id = str(ex.id)
            # A legacy row belongs to its exam and dies with it: give the copy its own row.
            ex = Exercise(
                teacher_id=teacher.id,
                name=ex.name,
                topic_tag=ex.topic_tag,
                latex_body=ex.latex_body,
                code_withheld=ex.code_withheld,
                max_points=ex.max_points,
                version=1,
                question_type=ex.question_type,
                correct_answers=copy.deepcopy(ex.correct_answers),
                penalty=ex.penalty,
            )
            db.add(ex)
            await db.flush()
            item_map[legacy_id] = str(ex.id)
        db.add(
            ExamExercise(
                exam_id=exam.id,
                exercise_id=ex.id,
                order_index=order,
                mc_group_id=group_map.get(gid) if gid else None,
                sub_index=sidx,
            )
        )

    if source.page_breaks:
        exam.page_breaks = [item_map.get(item, item) for item in source.page_breaks]

    logo = await get_exam_logo(source.id, db)
    if logo is not None:
        db.add(
            ExamLogo(
                exam_id=exam.id,
                mode=logo.mode,
                mime_type=logo.mime_type,
                byte_size=logo.byte_size,
                content=logo.content,
            )
        )
    await db.flush()
    await audit_svc.log(db, request, teacher, "EXAM_DUPLICATED", exam.id)
    return await load_exam_response(exam, db)


@router.get("/{exam_id}", response_model=ExamResponse)
async def get_exam(
    exam: Exam = Depends(get_exam_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> ExamResponse:
    """Get exam details with live-linked exercises."""
    return await load_exam_response(exam, db)


@router.get("/{exam_id}/exercises", response_model=list[ExerciseResponse])
async def list_exam_exercises(
    exam: Exam = Depends(get_exam_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> list[ExerciseResponse]:
    """Get exercises linked to a specific exam."""
    return [exercise_response(row) for row in await fetch_exam_exercises(exam.id, db)]


@router.patch("/{exam_id}", response_model=ExamResponse)
async def update_exam(
    body: ExamUpdate,
    exam: Exam = Depends(get_exam_for_teacher),
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> ExamResponse:
    """Update exam details and exercise links."""
    for name, value in body.model_dump(exclude_unset=True, include=_UPDATED_FIELDS).items():
        if value is not None or name == "topic":
            setattr(exam, name, value)
    if "latex_packages" in body.model_fields_set:
        exam.latex_packages = _packages_column(body.latex_packages)
    if "page_breaks" in body.model_fields_set:
        exam.page_breaks = body.page_breaks or None
    if "extra_notes" in body.model_fields_set:
        exam.extra_notes = body.extra_notes.model_dump() if body.extra_notes else None

    if body.mc_groups is not None:
        # Detach the links before dropping the groups. exam_exercises.mc_group_id is a real FK, so deleting a group would otherwise take its member rows with it — silently removing those exercises from the exam.
        await db.execute(
            update(ExamExercise)
            .where(ExamExercise.exam_id == exam.id)
            .values(mc_group_id=None, sub_index=None)
        )
        await db.execute(delete(ExamMcGroup).where(ExamMcGroup.exam_id == exam.id))
        await db.flush()
        mc_group_id_map = await _persist_mc_groups(exam.id, body.mc_groups, db)
    else:
        # Groups untouched: links may still address the groups already on the exam.
        existing_groups = await fetch_exam_mc_groups(exam.id, db)
        mc_group_id_map = {g.id: g.id for g in existing_groups}

    if body.exercise_links is not None:
        await db.execute(delete(ExamExercise).where(ExamExercise.exam_id == exam.id))
        await db.flush()
        for link_data in _dedupe_exercise_links(body.exercise_links):
            ex = await _resolve_linkable_exercise(link_data.exercise_id, teacher, db)
            resolved_group_id = _resolve_mc_group_id(link_data.mc_group_id, mc_group_id_map)
            db.add(ExamExercise(
                exam_id=exam.id,
                exercise_id=ex.id,
                order_index=link_data.order_index,
                mc_group_id=resolved_group_id,
                sub_index=link_data.sub_index,
            ))
    elif body.exercise_ids is not None:
        await db.execute(delete(ExamExercise).where(ExamExercise.exam_id == exam.id))
        order = 1
        for eid in body.exercise_ids:
            ex = await _resolve_linkable_exercise(eid, teacher, db)
            db.add(ExamExercise(exam_id=exam.id, exercise_id=ex.id, order_index=order))
            order += 1

    await db.flush()
    return await load_exam_response(exam, db)


@router.delete("/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exam(
    exam: Exam = Depends(get_exam_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft-delete an exam and start the erasure grace period of its student data. Retention skips deleted exams and only erases child rows with a deadline, so without the cascade a deleted exam's identities and submissions would be kept forever."""
    now = datetime.now(tz=UTC)
    grace_deadline = date.today() + timedelta(days=settings.RETENTION_GRACE_DAYS)
    exam.deleted_at = now
    await db.execute(
        update(StudentIdentity)
        .where(StudentIdentity.exam_id == exam.id, StudentIdentity.deleted_at.is_(None))
        .values(deleted_at=now, retention_until=grace_deadline)
    )
    await db.execute(
        update(ScanSubmission)
        .where(ScanSubmission.exam_id == exam.id, ScanSubmission.deleted_at.is_(None))
        .values(deleted_at=now, retention_until=grace_deadline)
    )
