"""Lookups and edits shared by the exercise library routes: filters, own groups, metadata."""
from __future__ import annotations

import uuid
from collections.abc import Mapping

from fastapi import HTTPException, status
from sqlalchemy import Select, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exercise import Exercise
from app.models.exercise_group import ExerciseGroup
from app.models.teacher import Teacher
from app.schemas.exam import ExerciseGroupUpdate, ExerciseUpdate

#: Organisation fields a group shares with every row in it.
GROUP_METADATA_FIELDS = ("name", "topic_tag", "grade", "subject")


def filtered[*Ts](
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


async def get_own_group(
    group_id: uuid.UUID, teacher_id: uuid.UUID, db: AsyncSession, *, lock: bool = False
) -> ExerciseGroup:
    """Return the group only if *teacher_id* owns it, else 404. *lock* serializes group writers."""
    query = select(ExerciseGroup).where(
        ExerciseGroup.id == group_id,
        ExerciseGroup.teacher_id == teacher_id,
    )
    group = (await db.execute(query.with_for_update() if lock else query)).scalar_one_or_none()
    if group is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Exercise group not found"
        )
    return group


async def group_of(ex: Exercise, teacher: Teacher, db: AsyncSession) -> ExerciseGroup:
    """The own group of *ex*, created (and *ex* moved into it) for a loose exercise."""
    if ex.exercise_group_id is not None:
        return await get_own_group(ex.exercise_group_id, teacher.id, db)
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


def metadata_changes(body: ExerciseGroupUpdate | ExerciseUpdate) -> dict[str, str]:
    """The group metadata a request sets; null leaves a field alone."""
    values = {name: getattr(body, name) for name in GROUP_METADATA_FIELDS}
    return {name: value for name, value in values.items() if value is not None}


async def cascade_group_metadata(
    group_id: uuid.UUID, teacher_id: uuid.UUID, changes: Mapping[str, str], db: AsyncSession
) -> None:
    """Write *changes* onto the group and every row in it. Both are scoped to the owner, so a shared group id can never reach another account's rows."""
    group = await db.get(ExerciseGroup, group_id)
    members = (
        await db.execute(
            select(Exercise).where(
                Exercise.exercise_group_id == group_id, Exercise.teacher_id == teacher_id
            )
        )
    ).scalars()
    owned = [group] if group is not None and group.teacher_id == teacher_id else []
    for row in (*owned, *members):
        for name, value in changes.items():
            setattr(row, name, value)
