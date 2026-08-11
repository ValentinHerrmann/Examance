"""Exams router — /api/v1/exams/*"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_teacher, get_exam_for_teacher
from app.models.exam import Exam
from app.models.exam_exercise import ExamExercise
from app.models.exam_mc_group import ExamMcGroup
from app.models.exercise import Exercise
from app.models.teacher import Teacher
from app.routers.exercises import parse_exercise_score
from app.schemas.exam import (
    ExamCreate,
    ExamMcGroupResponse,
    ExamResponse,
    ExamUpdate,
    ExerciseResponse,
)
from app.services.latex import CompilationError, compile_exam_latex

router = APIRouter(prefix="/exams", tags=["exams"])


def _to_exercise_response(
    ex: Exercise,
    order_index: int = 1,
    mc_group_id: uuid.UUID | None = None,
    sub_index: int | None = None,
) -> ExerciseResponse:
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
        order_index=order_index,
        question_type=ex.question_type,
        correct_answers=ex.correct_answers,
        penalty=ex.penalty,
        mc_group_id=mc_group_id,
        sub_index=sub_index,
    )


def _to_exam_response(
    e: Exam,
    exercises: list[tuple[Exercise, int, uuid.UUID | None, int | None]],
    mc_groups: list[ExamMcGroup],
) -> ExamResponse:
    group_members: dict[uuid.UUID, list[tuple[int, uuid.UUID]]] = {}
    for ex, _, gid, sidx in exercises:
        if gid is not None:
            group_members.setdefault(gid, []).append((sidx or 0, ex.id))

    return ExamResponse(
        id=e.id,
        teacher_id=e.teacher_id,
        title=e.title,
        latex_template=e.latex_template,
        compilation_status=e.compilation_status,
        created_at=e.created_at,
        retention_until=e.retention_until,
        testart=e.testart,
        klasse=e.klasse,
        datum=e.datum,
        nr=e.nr,
        fach=e.fach,
        lehrernachname=e.lehrernachname,
        info_text=e.info_text,
        exercises=[_to_exercise_response(ex, idx, gid, sidx) for ex, idx, gid, sidx in exercises],
        mc_groups=[
            ExamMcGroupResponse(
                id=g.id,
                exam_id=g.exam_id,
                title=g.title,
                scoring_text=g.scoring_text,
                order_index=g.order_index,
                member_ids=[
                    mid for _, mid in sorted(group_members.get(g.id, []))
                ],
            )
            for g in mc_groups
        ],
    )


async def _fetch_exam_exercises(
    exam_id: uuid.UUID, db: AsyncSession
) -> list[tuple[Exercise, int, uuid.UUID | None, int | None]]:
    result = await db.execute(
        select(Exercise, ExamExercise.order_index, ExamExercise.mc_group_id, ExamExercise.sub_index)
        .join(ExamExercise, Exercise.id == ExamExercise.exercise_id)
        .where(ExamExercise.exam_id == exam_id)
        .order_by(ExamExercise.order_index.asc())
    )
    rows = result.all()
    if rows:
        return [(ex, order, gid, sidx) for ex, order, gid, sidx in rows]

    # Fallback to direct exam_id link for older exams
    fallback_res = await db.execute(
        select(Exercise).where(Exercise.exam_id == exam_id).order_by(Exercise.order_index.asc())
    )
    old_exs = fallback_res.scalars().all()
    return [(ex, ex.order_index, None, None) for ex in old_exs]


async def _fetch_exam_mc_groups(exam_id: uuid.UUID, db: AsyncSession) -> list[ExamMcGroup]:
    result = await db.execute(
        select(ExamMcGroup)
        .where(ExamMcGroup.exam_id == exam_id)
        .order_by(ExamMcGroup.order_index.asc())
    )
    return list(result.scalars().all())


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
        query = query.where(Exam.klasse == grade)

    if subject:
        query = query.where(Exam.fach == subject)

    if search:
        search_pattern = f"%{search}%"
        query = query.where(
            or_(
                Exam.title.ilike(search_pattern),
                Exam.klasse.ilike(search_pattern),
                Exam.fach.ilike(search_pattern),
            )
        )

    query = query.order_by(Exam.created_at.desc())
    result = await db.execute(query)
    exams = result.scalars().all()
    out = []
    for e in exams:
        exs = await _fetch_exam_exercises(e.id, db)
        groups = await _fetch_exam_mc_groups(e.id, db)
        out.append(_to_exam_response(e, exs, groups))
    return out


async def _persist_mc_groups(
    exam_id: uuid.UUID,
    mc_groups_data: list[Any],
    db: AsyncSession,
) -> dict[uuid.UUID, uuid.UUID]:
    """Create ExamMcGroup rows and return {client_id: db_id} mapping."""
    id_map: dict[uuid.UUID, uuid.UUID] = {}
    for g in mc_groups_data:
        new_id = uuid.uuid4()
        client_id = g.id or new_id
        group = ExamMcGroup(
            id=new_id,
            exam_id=exam_id,
            title=g.title,
            scoring_text=g.scoring_text,
            order_index=g.order_index,
        )
        db.add(group)
        id_map[client_id] = new_id
    await db.flush()
    return id_map


@router.post("", response_model=ExamResponse, status_code=status.HTTP_201_CREATED)
async def create_exam(
    body: ExamCreate,
    teacher: Teacher = Depends(get_current_teacher),
    db: AsyncSession = Depends(get_db),
) -> ExamResponse:
    """Create a new exam and live-link exercises from library or inline creation."""
    kwargs = {
        "teacher_id": teacher.id,
        "title": body.title,
        "latex_template": body.latex_template,
        "retention_until": body.retention_until,
        "testart": body.testart,
        "klasse": body.klasse,
        "datum": body.datum,
        "nr": body.nr,
        "fach": body.fach,
        "lehrernachname": body.lehrernachname,
        "info_text": body.info_text,
    }
    if body.id:
        kwargs["id"] = body.id
    exam = Exam(**kwargs)
    db.add(exam)
    await db.flush()

    # Persist MC groups first so we can map client IDs to DB IDs
    mc_group_id_map: dict[uuid.UUID, uuid.UUID] = {}
    if body.mc_groups:
        mc_group_id_map = await _persist_mc_groups(exam.id, body.mc_groups, db)

    linked_exercises: list[tuple[Exercise, int, uuid.UUID | None, int | None]] = []
    order = 1

    # 1. Link existing library exercises via exercise_links (mc-aware)
    if body.exercise_links:
        for link_data in body.exercise_links:
            res = await db.execute(select(Exercise).where(Exercise.id == link_data.exercise_id))
            ex = res.scalar_one_or_none()
            if ex:
                resolved_group_id = None
                if link_data.mc_group_id and link_data.mc_group_id in mc_group_id_map:
                    resolved_group_id = mc_group_id_map[link_data.mc_group_id]
                elif link_data.mc_group_id:
                    resolved_group_id = link_data.mc_group_id
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
            res = await db.execute(select(Exercise).where(Exercise.id == eid))
            ex = res.scalar_one_or_none()
            if ex:
                link = ExamExercise(exam_id=exam.id, exercise_id=ex.id, order_index=order)
                db.add(link)
                linked_exercises.append((ex, order, None, None))
                order += 1

    # 3. Create and link inline exercises
    if body.exercises:
        for ex_data in body.exercises:
            computed_score = parse_exercise_score(ex_data.latex_body) if ex_data.latex_body else ex_data.max_points
            ex = Exercise(
                teacher_id=teacher.id,
                name=ex_data.name,
                topic_tag=ex_data.topic_tag,
                latex_body=ex_data.latex_body,
                max_points=computed_score,
                version=1,
                question_type=ex_data.question_type,
                correct_answers=ex_data.correct_answers,
                penalty=ex_data.penalty,
            )
            db.add(ex)
            await db.flush()

            resolved_group_id = None
            if ex_data.mc_group_id and ex_data.mc_group_id in mc_group_id_map:
                resolved_group_id = mc_group_id_map[ex_data.mc_group_id]
            elif ex_data.mc_group_id:
                resolved_group_id = ex_data.mc_group_id

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
    mc_groups = await _fetch_exam_mc_groups(exam.id, db)
    return _to_exam_response(exam, linked_exercises, mc_groups)


@router.get("/{exam_id}", response_model=ExamResponse)
async def get_exam(
    exam: Exam = Depends(get_exam_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> ExamResponse:
    """Get exam details with live-linked exercises."""
    exs = await _fetch_exam_exercises(exam.id, db)
    groups = await _fetch_exam_mc_groups(exam.id, db)
    return _to_exam_response(exam, exs, groups)


@router.get("/{exam_id}/exercises", response_model=list[ExerciseResponse])
async def list_exam_exercises(
    exam: Exam = Depends(get_exam_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> list[ExerciseResponse]:
    """Get exercises linked to a specific exam."""
    exs = await _fetch_exam_exercises(exam.id, db)
    return [_to_exercise_response(ex, idx, gid, sidx) for ex, idx, gid, sidx in exs]



@router.patch("/{exam_id}", response_model=ExamResponse)
async def update_exam(
    body: ExamUpdate,
    exam: Exam = Depends(get_exam_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> ExamResponse:
    """Update exam details and exercise links."""
    if body.title is not None:
        exam.title = body.title
    if body.latex_template is not None:
        exam.latex_template = body.latex_template
    if body.retention_until is not None:
        exam.retention_until = body.retention_until
    if body.testart is not None:
        exam.testart = body.testart
    if body.klasse is not None:
        exam.klasse = body.klasse
    if body.datum is not None:
        exam.datum = body.datum
    if body.nr is not None:
        exam.nr = body.nr
    if body.fach is not None:
        exam.fach = body.fach
    if body.lehrernachname is not None:
        exam.lehrernachname = body.lehrernachname
    if body.info_text is not None:
        exam.info_text = body.info_text

    if body.mc_groups is not None:
        await db.execute(delete(ExamMcGroup).where(ExamMcGroup.exam_id == exam.id))
        await db.flush()
        mc_group_id_map = await _persist_mc_groups(exam.id, body.mc_groups, db)
    else:
        mc_group_id_map = {}

    if body.exercise_links is not None:
        await db.execute(delete(ExamExercise).where(ExamExercise.exam_id == exam.id))
        for link_data in body.exercise_links:
            resolved_group_id = None
            if link_data.mc_group_id and link_data.mc_group_id in mc_group_id_map:
                resolved_group_id = mc_group_id_map[link_data.mc_group_id]
            elif link_data.mc_group_id:
                resolved_group_id = link_data.mc_group_id
            db.add(ExamExercise(
                exam_id=exam.id,
                exercise_id=link_data.exercise_id,
                order_index=link_data.order_index,
                mc_group_id=resolved_group_id,
                sub_index=link_data.sub_index,
            ))
    elif body.exercise_ids is not None:
        await db.execute(delete(ExamExercise).where(ExamExercise.exam_id == exam.id))
        order = 1
        for eid in body.exercise_ids:
            db.add(ExamExercise(exam_id=exam.id, exercise_id=eid, order_index=order))
            order += 1

    await db.flush()
    exs = await _fetch_exam_exercises(exam.id, db)
    groups = await _fetch_exam_mc_groups(exam.id, db)
    return _to_exam_response(exam, exs, groups)


@router.delete("/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exam(
    exam: Exam = Depends(get_exam_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Soft-delete an exam."""
    exam.deleted_at = datetime.now(tz=timezone.utc)


@router.post("/{exam_id}/compile")
async def compile_exam_endpoint(
    answers: bool = False,
    exam: Exam = Depends(get_exam_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Compile complete exam LaTeX document using live-linked library exercises."""
    ex_tuples = await _fetch_exam_exercises(exam.id, db)
    mc_groups = await _fetch_exam_mc_groups(exam.id, db)

    try:
        pdf_bytes = await compile_exam_latex(exam, ex_tuples, mc_groups, show_answers=answers)
        exam.compilation_status = "compiled"
        await db.flush()
    except TimeoutError:
        exam.compilation_status = "failed"
        await db.flush()
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Compilation timed out.",
            headers={"code": "ERR_COMPILE_TIMEOUT"},
        )
    except CompilationError as exc:
        exam.compilation_status = "failed"
        await db.flush()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
            headers={"code": "ERR_COMPILE_FAILED"},
        )

    filename = f"Exam_{exam.title.replace(' ', '_')}{'_answers' if answers else ''}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
