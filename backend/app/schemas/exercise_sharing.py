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
    local_variants: int = 0


class ResyncVariant(BaseModel):
    kind: Literal["changed", "new", "unchanged", "removed", "local"]
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


class ResyncOverride(BaseModel):
    model_config = ConfigDict(extra="forbid")

    latex_body: str = Field(max_length=200_000)


class ResyncRequest(BaseModel):
    """The variants to take over, by source row id -> the fingerprint the user reviewed (CAS); a
    subset is fine. `overrides` holds the user's edited LaTeX for some of them."""

    model_config = ConfigDict(extra="forbid")

    source_fingerprints: dict[uuid.UUID, str] = Field(default_factory=dict)
    overrides: dict[uuid.UUID, ResyncOverride] = Field(default_factory=dict)


class BulkSharingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    shared: bool


class BulkSharingResult(BaseModel):
    groups: int
    # Groups copied from another account: never shared as one's own.
    skipped_copies: int


class SharingPauseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    paused: bool
