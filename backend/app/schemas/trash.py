"""Schemas for /api/v1/trash (issue #125)."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class TrashEntryOut(BaseModel):
    """One delete inside a group. `label` holds ids, plaintext titles, row counts per table and, for results, the sealed student identity the browser decrypts."""

    id: uuid.UUID
    kind: str
    label: dict[str, Any]
    deleted_at: datetime
    purge_after: datetime


class TrashGroupOut(BaseModel):
    """Everything one UI action deleted; restored or erased as a whole."""

    group_id: uuid.UUID
    deleted_at: datetime
    purge_after: datetime
    entries: list[TrashEntryOut]


class TrashListOut(BaseModel):
    grace_days: int
    groups: list[TrashGroupOut]


class TrashSkippedOut(BaseModel):
    """A row that did not come back (`parent_missing`, `already_exists`, `changed_since`, `gone`, `pseudonym_changed`) or came back changed (`detached`, `older_version`)."""

    table: str
    id: str | None
    reason: str


class TrashRestoreOut(BaseModel):
    restored: dict[str, int]
    skipped: list[TrashSkippedOut]
