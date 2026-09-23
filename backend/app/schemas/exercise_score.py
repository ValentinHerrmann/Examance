"""Schemas for per-exercise scores. The payload is an opaque client-sealed blob."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ExerciseScoreIn(BaseModel):
    # Only seeds a new row; an existing (submission, exercise) pair keeps its id.

    id: uuid.UUID | None = None
    exercise_id: uuid.UUID
    payload_ciphertext_b64: str | None = None
    payload_iv_b64: str | None = None


class ExerciseScoreBulkPut(BaseModel):

    scores: list[ExerciseScoreIn] = Field(default_factory=list, max_length=500)


class ExerciseScoreResponse(BaseModel):
    id: uuid.UUID
    submission_id: uuid.UUID
    exercise_id: uuid.UUID
    payload_ciphertext_b64: str | None = None
    payload_iv_b64: str | None = None
    updated_at: datetime
