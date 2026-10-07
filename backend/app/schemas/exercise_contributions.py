"""Schemas for proposals from a linked copy back to the shared original (issue #65)."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.exam import ExerciseResponse


class ContributionSubmit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The contributor's own rows in the linked copy.
    exercise_ids: list[uuid.UUID] = Field(min_length=1, max_length=50)
    message: str | None = Field(default=None, max_length=1000)


class ContributionAccept(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The owner's edited LaTeX; absent = the proposal as submitted.
    latex_body: str | None = Field(default=None, max_length=200_000)
    as_variant: bool = False
    variant_key: str | None = Field(default=None, max_length=100)


class ContributionReject(BaseModel):
    model_config = ConfigDict(extra="forbid")

    note: str | None = Field(default=None, max_length=1000)


class ContributionSummary(BaseModel):
    id: uuid.UUID
    direction: Literal["incoming", "outgoing"]
    exercise_name: str | None = None
    kind: Literal["version", "variant"]
    variant_key: str | None = None
    message: str | None = None
    status: Literal["pending", "accepted", "rejected", "withdrawn"]
    decision_note: str | None = None
    created_at: datetime
    decided_at: datetime | None = None
    # Incoming: who proposed (disclosed with consent at submit). Outgoing: the author.
    counterpart_email: str | None = None
    stale: bool = False
    target_gone: bool = False
    result_exercise_id: uuid.UUID | None = None
    # The viewer's own exercise group this proposal is about (author: the original; contributor:
    # their copy). Never the other account's group.
    library_group_id: uuid.UUID | None = None


class ContributionFile(BaseModel):
    filename: str
    change: Literal["added", "removed", "changed", "unchanged"]
    # Set for a file the proposal carries (download via the proposal).
    resource_id: uuid.UUID | None = None


class ContributionDetail(ContributionSummary):
    latex_body: str | None = None
    question_type: str | None = None
    correct_answers: dict[str, Any] | None = None
    max_points: float = 0.0
    penalty: float = 0.0
    # Owner only: the current row the proposal applies to (null for a new variant).
    base: ExerciseResponse | None = None
    files: list[ContributionFile] = []


class PendingForGroup(BaseModel):
    group_id: uuid.UUID
    incoming: int = 0
    outgoing: int = 0


class ContributionCount(BaseModel):
    incoming_pending: int
    # Pending proposals per own group, for the tag on the library card.
    pending_by_group: list[PendingForGroup] = []
