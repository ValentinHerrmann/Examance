"""Schemas for exercise sharing, copying and resync (issue #65)."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.exam import ExerciseResponse


class SharedExerciseResponse(BaseModel):
    """Another account's shared row. Carries no owner id and no exam id, only the sharer's
    e-mail, which they agreed to disclose when sharing."""

    id: uuid.UUID
    exercise_group_id: uuid.UUID | None = None
    name: str | None = None
    topic_tag: str | None = None
    grade: str | None = None
    subject: str | None = None
    latex_body: str | None = None
    max_points: float = 0.0
    version: int = 1
    variant_key: str | None = None
    question_type: str = "free_text"
    correct_answers: dict[str, Any] | None = None
    penalty: float = 0.0
    shared_at: datetime | None = None
    shared_by_email: str


class ExerciseSharingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    shared: bool


class CopyResponse(BaseModel):
    group_id: uuid.UUID
    exercises: list[ExerciseResponse]


SyncStateName = Literal["up_to_date", "update_available", "source_unavailable"]


class SyncStatusItem(BaseModel):
    group_id: uuid.UUID
    state: SyncStateName
    locally_modified: bool
    changed_variants: int
    new_variants: int
    removed_variants: int


class ResyncVariant(BaseModel):
    kind: Literal["changed", "new", "unchanged", "removed"]
    locally_modified: bool
    source_exercise_id: uuid.UUID | None = None
    source_fingerprint: str | None = None
    # Source content for the diff; the copy's own row is the caller's anyway.
    source: SharedExerciseResponse | None = None
    own: ExerciseResponse | None = None


class ResyncPreviewResponse(BaseModel):
    group_id: uuid.UUID
    state: SyncStateName
    variants: list[ResyncVariant]


class ResyncRequest(BaseModel):
    """The source fingerprints the user reviewed (compare-and-set against the current source)."""

    model_config = ConfigDict(extra="forbid")

    source_fingerprints: dict[uuid.UUID, str] = Field(default_factory=dict)
