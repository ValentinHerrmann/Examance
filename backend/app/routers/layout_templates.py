"""Layout templates of the exam Layout step (issue #279) — /api/v1/user/layout-templates. Only the slots the account changed are stored; the built-in defaults live in the frontend (lib/exam/layoutPresets.ts)."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import ValidationError

from app.dependencies import DB, CurrentTeacher, get_teaching_teacher
from app.models.teacher import Teacher
from app.schemas.layout_templates import LayoutTemplates

router = APIRouter(tags=["layout-templates"], dependencies=[Depends(get_teaching_teacher)])


def _stored(teacher: Teacher) -> LayoutTemplates:
    try:
        return LayoutTemplates.model_validate({"templates": teacher.layout_templates or []})
    except ValidationError:
        # A list stored by another version that no longer validates reads as the defaults.
        return LayoutTemplates()


@router.get("/user/layout-templates")
async def get_layout_templates(teacher: CurrentTeacher) -> LayoutTemplates:
    """The account's edited layout templates."""
    return _stored(teacher)


@router.put("/user/layout-templates")
async def set_layout_templates(body: LayoutTemplates, teacher: CurrentTeacher, db: DB) -> LayoutTemplates:
    """Replace the account's edited templates; an empty list resets all to the defaults."""
    teacher.layout_templates = [t.model_dump() for t in body.templates] or None
    await db.flush()
    return _stored(teacher)
