"""Database access for exercise resource files used during compilation."""
from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exercise import Exercise
from app.models.exercise_resource import ExerciseResource
from app.services.latex_resources import merge_resources


async def load_resources_for_exercises(
    exercise_ids: Sequence[uuid.UUID],
    teacher_id: uuid.UUID,
    db: AsyncSession,
) -> dict[str, bytes]:
    """
    Resource files of *exercise_ids*, merged into one working-directory map.

    Only exercises the teacher may read are considered — their own, or ones
    explicitly published — mirroring ``get_readable_exercise``. Ids the caller
    may not read are skipped rather than rejected: the compile endpoint takes
    the list as a hint about what the document needs, not as an assertion of
    ownership, and a missing figure is a better failure mode than a 403 on an
    exercise that was deleted between save and compile.
    """
    if not exercise_ids:
        return {}

    unique_ids = list(dict.fromkeys(exercise_ids))
    readable = (
        (
            await db.execute(
                select(Exercise.id, Exercise.name).where(
                    Exercise.id.in_(unique_ids),
                    or_(Exercise.teacher_id == teacher_id, Exercise.is_public.is_(True)),
                )
            )
        )
        .tuples()
        .all()
    )
    if not readable:
        return {}

    labels = {ex_id: (name or str(ex_id)) for ex_id, name in readable}
    rows = (
        (
            await db.execute(
                select(ExerciseResource).where(ExerciseResource.exercise_id.in_(labels.keys()))
            )
        )
        .scalars()
        .all()
    )
    return merge_resources(
        [(labels.get(r.exercise_id, "?"), r.filename, r.content) for r in rows]
    )
