"""Schemas for exam statistics (issue #238). The payload is an opaque client-sealed blob."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class ExamStatisticsIn(BaseModel):
    computed_at: datetime
    payload_ciphertext_b64: str
    payload_iv_b64: str


class ExamStatisticsKeepIn(BaseModel):
    keep_after_exam_delete: bool


class ExamStatisticsOut(BaseModel):
    id: uuid.UUID
    exam_id: uuid.UUID
    keep_after_exam_delete: bool
    computed_at: datetime
    updated_at: datetime
    payload_ciphertext_b64: str
    payload_iv_b64: str
