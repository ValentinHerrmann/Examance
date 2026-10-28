"""Reading an exam with its exercises and MC groups, and the response built from them."""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exam import Exam
from app.models.exam_exercise import ExamExercise
from app.models.exam_mc_group import ExamMcGroup
from app.models.exercise import Exercise
from app.schemas.exam import ExamMcGroupResponse, ExamResponse, ExerciseResponse, ExtraNotes
from app.schemas.latex_packages import LatexPackageEntry
from app.services.latex_packages import stored_entries

# (exercise, order_index, mc_group_id, sub_index): the exercise with its place in the exam.
ExerciseRow = tuple[Exercise, int, uuid.UUID | None, int | None]

# Columns copied by name. `exercises` stays out: on an Exam it is the ORM relationship of that
# name, and reading it lazy-loads, which fails on an async session.
_EXAM_COLUMNS = ExamResponse.model_fields.keys() - {
    "latex_packages",
    "extra_notes",
    "exercises",
    "mc_groups",
}


def stored_packages(value: object) -> list[LatexPackageEntry] | None:
    """The exam's package override for responses; null when it follows the account."""
    if value is None:
        return None
    return [
        LatexPackageEntry(kind=e.kind, name=e.name, options=e.options, disabled=e.disabled)
        for e in stored_entries(value)
    ]


def exercise_response(row: ExerciseRow) -> ExerciseResponse:
    """An exercise as embedded in an exam. Share state and provenance are library-only fields."""
    ex, order_index, mc_group_id, sub_index = row
    return ExerciseResponse.from_exercise(
        ex,
        order_index=order_index,
        mc_group_id=mc_group_id,
        sub_index=sub_index,
        is_shared=False,
        shared_at=None,
        copied_from_exercise_id=None,
    )


def exam_response(
    exam: Exam, exercises: list[ExerciseRow], mc_groups: list[ExamMcGroup]
) -> ExamResponse:
    members: dict[uuid.UUID, list[tuple[int, uuid.UUID]]] = {}
    for ex, _, group_id, sub_index in exercises:
        if group_id is not None:
            members.setdefault(group_id, []).append((sub_index or 0, ex.id))

    return ExamResponse(
        **{name: getattr(exam, name) for name in _EXAM_COLUMNS},
        latex_packages=stored_packages(exam.latex_packages),
        extra_notes=ExtraNotes.model_validate(exam.extra_notes) if exam.extra_notes else None,
        exercises=[exercise_response(row) for row in exercises],
        mc_groups=[
            ExamMcGroupResponse.model_validate(g, from_attributes=True).model_copy(
                update={"member_ids": [mid for _, mid in sorted(members.get(g.id, []))]}
            )
            for g in mc_groups
        ],
    )


async def fetch_exercises_for_exams(
    exam_ids: list[uuid.UUID], db: AsyncSession
) -> dict[uuid.UUID, list[ExerciseRow]]:
    """Every listed exam's exercises in one query (plus one for legacy links)."""
    by_exam: dict[uuid.UUID, list[ExerciseRow]] = {exam_id: [] for exam_id in exam_ids}
    if not exam_ids:
        return by_exam

    result = await db.execute(
        select(
            ExamExercise.exam_id,
            Exercise,
            ExamExercise.order_index,
            ExamExercise.mc_group_id,
            ExamExercise.sub_index,
        )
        .join(ExamExercise, Exercise.id == ExamExercise.exercise_id)
        .where(ExamExercise.exam_id.in_(exam_ids))
        .order_by(ExamExercise.order_index.asc(), ExamExercise.sub_index.asc())
    )
    for exam_id, exercise, order, group_id, sub_index in result.all():
        by_exam[exam_id].append((exercise, order, group_id, sub_index))

    # Legacy exams link via exercise.exam_id instead of the junction table.
    legacy_ids = [exam_id for exam_id, rows in by_exam.items() if not rows]
    if legacy_ids:
        legacy = await db.execute(
            select(Exercise)
            .where(Exercise.exam_id.in_(legacy_ids))
            .order_by(Exercise.order_index.asc())
        )
        for exercise in legacy.scalars().all():
            if exercise.exam_id is not None:
                by_exam[exercise.exam_id].append((exercise, exercise.order_index, None, None))

    return by_exam


async def fetch_exam_exercises(exam_id: uuid.UUID, db: AsyncSession) -> list[ExerciseRow]:
    return (await fetch_exercises_for_exams([exam_id], db))[exam_id]


async def fetch_mc_groups_for_exams(
    exam_ids: list[uuid.UUID], db: AsyncSession
) -> dict[uuid.UUID, list[ExamMcGroup]]:
    """Every listed exam's MC groups in one query, keyed by exam id."""
    by_exam: dict[uuid.UUID, list[ExamMcGroup]] = {exam_id: [] for exam_id in exam_ids}
    if not exam_ids:
        return by_exam
    result = await db.execute(
        select(ExamMcGroup)
        .where(ExamMcGroup.exam_id.in_(exam_ids))
        .order_by(ExamMcGroup.order_index.asc())
    )
    for group in result.scalars().all():
        by_exam[group.exam_id].append(group)
    return by_exam


async def fetch_exam_mc_groups(exam_id: uuid.UUID, db: AsyncSession) -> list[ExamMcGroup]:
    return (await fetch_mc_groups_for_exams([exam_id], db))[exam_id]


async def load_exam_response(exam: Exam, db: AsyncSession) -> ExamResponse:
    """*exam* with its current exercises and MC groups, read from the database."""
    return exam_response(
        exam, await fetch_exam_exercises(exam.id, db), await fetch_exam_mc_groups(exam.id, db)
    )
