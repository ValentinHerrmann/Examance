"""Pydantic schemas for per-exercise grading results.

There is deliberately no plaintext score field. The client seals score,
selectedOptions and omrMeta into one AES-256-GCM payload (see
lib/db/dbEncryption.ts `encryptScore`), and this API only ever moves that
opaque blob — a per-question plaintext record of how a pupil answered each item
would reconstruct the answer sheet.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ExerciseScoreIn(BaseModel):
    """One score in a bulk write.

    ``id`` is honoured only when the (submission, exercise) pair is new; an
    existing pair keeps the row it already has, which is what makes the bulk
    write idempotent rather than a 409 on every re-save.
    """

    id: uuid.UUID | None = None
    exercise_id: uuid.UUID
    payload_ciphertext_b64: str | None = None
    payload_iv_b64: str | None = None


class ExerciseScoreBulkPut(BaseModel):
    """The complete set of scores a client wants present for one submission.

    Entries not listed are left alone — clearing one exercise back to ungraded
    is a DELETE, not an omission, so a partial save cannot wipe the rest.
    """

    scores: list[ExerciseScoreIn] = Field(default_factory=list, max_length=500)


class ExerciseScoreResponse(BaseModel):
    id: uuid.UUID
    submission_id: uuid.UUID
    exercise_id: uuid.UUID
    payload_ciphertext_b64: str | None = None
    payload_iv_b64: str | None = None
    updated_at: datetime
