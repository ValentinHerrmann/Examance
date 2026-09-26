"""Pydantic schemas for ScanSubmission endpoints."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SubmissionCreate(BaseModel):
    id: uuid.UUID | None = None
    pseudonym_hmac: str = Field(min_length=64, max_length=64)
    scan_ciphertext_b64: str | None = None
    scan_iv_b64: str | None = None
    annotation_ciphertext_b64: str | None = None
    annotation_iv_b64: str | None = None
    total_score: float | None = None
    #: Omitting the annotation ciphertext keeps the stored layer; this deletes it.
    clear_annotations: bool = False


class SubmissionScoreUpdate(BaseModel):
    """Schema for updating submission score."""
    total_score: float | None = Field(default=None, ge=0)


class SubmissionResponse(BaseModel):
    id: uuid.UUID
    exam_id: uuid.UUID
    pseudonym_hmac: str
    total_score: float | None
    scan_ciphertext_b64: str | None = None
    scan_iv_b64: str | None = None
    annotation_ciphertext_b64: str | None = None
    annotation_iv_b64: str | None = None
    created_at: datetime
    #: Cheap presence flags so a light list (scan bytes omitted) can still show
    #: "has a scan" / "has annotations" without paying for the ciphertext.
    has_scan: bool = False
    has_annotations: bool = False
