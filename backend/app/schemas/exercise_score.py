"""Schemas for per-exercise scores. The payload is an opaque client-sealed blob."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Self

from pydantic import BaseModel, Field, model_validator


class ExerciseScoreIn(BaseModel):
    # Only seeds a new row; an existing (submission, exercise) pair keeps its id.

    id: uuid.UUID | None = None
    exercise_id: uuid.UUID
    payload_ciphertext_b64: str | None = None
    payload_iv_b64: str | None = None


class ExerciseScoreBulkPut(BaseModel):

    scores: list[ExerciseScoreIn] = Field(default_factory=list, max_length=500)

    @model_validator(mode="after")
    def _ids_name_one_exercise(self) -> Self:
        # One id on two exercises would insert two rows with the same key (a 500). A repeated
        # exercise is fine: the router lets the last item win.
        seen: dict[uuid.UUID, uuid.UUID] = {}
        for item in self.scores:
            if item.id is None:
                continue
            if seen.setdefault(item.id, item.exercise_id) != item.exercise_id:
                raise ValueError("A score id may belong to only one exercise.")
        return self


class ExerciseScoreResponse(BaseModel):
    id: uuid.UUID
    submission_id: uuid.UUID
    exercise_id: uuid.UUID
    payload_ciphertext_b64: str | None = None
    payload_iv_b64: str | None = None
    updated_at: datetime
