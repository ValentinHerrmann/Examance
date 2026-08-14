"""Pydantic schemas for Exam & Exercise endpoints."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.config import settings


def validate_retention_until(value: date | None) -> date | None:
    """
    Keep the retention date inside the configured window.

    The upper bound enforces Art. 5(1)(e): nothing may be scheduled to be kept
    indefinitely. The lower bound is off by default (RETENTION_MIN_DAYS = 0) so
    a teacher can still delete a draft immediately — see the note in config.py.
    """
    if value is None:
        return None
    today = date.today()
    earliest = today + timedelta(days=settings.RETENTION_MIN_DAYS)
    latest = today + timedelta(days=settings.RETENTION_MAX_DAYS)
    if value < earliest:
        raise ValueError(
            f"retention_until must be at least {settings.RETENTION_MIN_DAYS} days out "
            f"(earliest allowed: {earliest.isoformat()})."
        )
    if value > latest:
        raise ValueError(
            f"retention_until must be at most {settings.RETENTION_MAX_DAYS} days out "
            f"(latest allowed: {latest.isoformat()})."
        )
    return value


class ExerciseCreate(BaseModel):
    id: uuid.UUID | None = None
    name: str = "Exercise"
    topic_tag: str | None = None
    grade: str | None = None
    subject: str | None = None
    latex_body: str = ""
    max_points: float = 0.0
    order_index: int = 1
    question_type: str = "free_text"
    correct_answers: dict[str, Any] | None = None
    penalty: float = 0.0
    exercise_group_id: uuid.UUID | None = None
    variant_key: str | None = None
    mc_group_id: uuid.UUID | None = None
    sub_index: int | None = None


class ExerciseUpdate(BaseModel):
    name: str | None = None
    topic_tag: str | None = None
    grade: str | None = None
    subject: str | None = None
    latex_body: str | None = None
    max_points: float | None = None
    exercise_group_id: uuid.UUID | None = None
    variant_key: str | None = None
    question_type: str | None = None
    correct_answers: dict[str, Any] | None = None
    penalty: float | None = None


class ExerciseGroupUpdate(BaseModel):
    name: str | None = None
    topic_tag: str | None = None
    grade: str | None = None
    subject: str | None = None


class ExerciseGroupResponse(BaseModel):
    id: uuid.UUID
    teacher_id: uuid.UUID
    name: str
    topic_tag: str | None = None
    grade: str | None = None
    subject: str | None = None
    created_at: datetime


class ExerciseResponse(BaseModel):
    id: uuid.UUID
    teacher_id: uuid.UUID | None = None
    name: str | None = None
    topic_tag: str | None = None
    grade: str | None = None
    subject: str | None = None
    latex_body: str | None = None
    max_points: float = 0.0
    version: int = 1
    exercise_group_id: uuid.UUID | None = None
    variant_key: str | None = None
    is_current: bool = True
    order_index: int = 1
    question_type: str = "free_text"
    correct_answers: dict[str, Any] | None = None
    penalty: float = 0.0
    mc_group_id: uuid.UUID | None = None
    sub_index: int | None = None


class ExamMcGroupCreate(BaseModel):
    id: uuid.UUID | None = None
    title: str = "Grundlagen"
    scoring_text: str = (
        "Für jedes korrekte Kreuz 1BE; für jedes falsche Kreuz -0,5BE. "
        "Pro Teilaufgabe aber immer $\\geq$0BE"
    )
    order_index: int = 1


class ExamMcGroupResponse(BaseModel):
    id: uuid.UUID
    exam_id: uuid.UUID
    title: str
    scoring_text: str
    order_index: int
    member_ids: list[uuid.UUID] = []


class ExerciseLinkCreate(BaseModel):
    """Links an existing library exercise to an exam, with optional MC group membership."""
    exercise_id: uuid.UUID
    order_index: int = 1
    mc_group_id: uuid.UUID | None = None
    sub_index: int | None = None


class ExamCreate(BaseModel):
    id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=500)
    latex_template: str = ""
    retention_until: date
    testart: str | None = None
    grade: str | None = None
    klasse: str | None = None
    datum: str | None = None
    nr: str | None = None
    fach: str | None = None
    lehrernachname: str | None = None
    info_text: str | None = None
    grading_key: dict[str, Any] | None = None
    exercise_ids: list[uuid.UUID] = []
    exercise_links: list[ExerciseLinkCreate] = []
    exercises: list[ExerciseCreate] = []
    mc_groups: list[ExamMcGroupCreate] = []

    _check_retention = field_validator("retention_until")(validate_retention_until)


class ExamUpdate(BaseModel):
    title: str | None = None
    latex_template: str | None = None
    retention_until: date | None = None
    testart: str | None = None
    grade: str | None = None
    klasse: str | None = None
    datum: str | None = None
    nr: str | None = None
    fach: str | None = None
    lehrernachname: str | None = None
    info_text: str | None = None
    grading_key: dict[str, Any] | None = None
    exercise_ids: list[uuid.UUID] | None = None
    exercise_links: list[ExerciseLinkCreate] | None = None
    mc_groups: list[ExamMcGroupCreate] | None = None

    _check_retention = field_validator("retention_until")(validate_retention_until)


class ExamResponse(BaseModel):
    id: uuid.UUID
    teacher_id: uuid.UUID
    title: str
    latex_template: str
    compilation_status: str
    created_at: datetime
    retention_until: date
    testart: str | None = None
    grade: str | None = None
    klasse: str | None = None
    datum: str | None = None
    nr: str | None = None
    fach: str | None = None
    lehrernachname: str | None = None
    info_text: str | None = None
    grading_key: dict[str, Any] | None = None
    exercises: list[ExerciseResponse] = []
    mc_groups: list[ExamMcGroupResponse] = []


class ExamUsageItem(BaseModel):
    id: uuid.UUID
    title: str
    datum: str | None = None


class ExerciseUsageResponse(BaseModel):
    exam_count: int
    exams: list[ExamUsageItem] = []

