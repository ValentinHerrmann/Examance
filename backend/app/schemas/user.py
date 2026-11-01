"""Schemas for /user/* account actions."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AccountDeletionRequestIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Keep the library exercises on the server without an owner (for future sharing).
    keep_exercises: bool = False


class PurgedExamResults(BaseModel):
    """A live exam whose soft-deleted results retention already erased for good."""

    exam_id: uuid.UUID
    purged_at: datetime


class RestoreServerDataOut(BaseModel):
    """Outcome of `POST /user/restore-server-data`, including what could no longer be restored (issue #181)."""

    status: str = "ok"
    restored_student_identities: int
    restored_submissions: int
    grace_days: int
    purged_exams: list[PurgedExamResults]
