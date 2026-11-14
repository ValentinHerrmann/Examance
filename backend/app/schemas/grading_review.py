"""Schemas for the grading review record (issue #226). The payload is an opaque client-sealed blob."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class GradingReviewIn(BaseModel):
    # Only seeds a new row; an existing submission keeps its id.
    id: uuid.UUID | None = None
    payload_ciphertext_b64: str | None = None
    payload_iv_b64: str | None = None


class GradingReviewResponse(BaseModel):
    id: uuid.UUID
    submission_id: uuid.UUID
    payload_ciphertext_b64: str | None = None
    payload_iv_b64: str | None = None
    updated_at: datetime
