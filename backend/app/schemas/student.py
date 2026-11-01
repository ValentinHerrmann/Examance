"""Pydantic schemas for StudentIdentity endpoints."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class StudentIdentityCreate(BaseModel):
    pseudonym_hmac: str = Field(min_length=64, max_length=64)
    pii_ciphertext_b64: str
    iv_b64: str
    encryption_salt_b64: str
    #: How `pseudonym_hmac` was derived (issue #177); omitted by older clients, which mean 1.
    pseudonym_version: int = Field(default=1, ge=1, le=2)


class StudentIdentityResponse(BaseModel):
    pseudonym_hmac: str
    exam_id: uuid.UUID
    pii_ciphertext_b64: str
    iv_b64: str
    encryption_salt_b64: str
    #: The exam's pseudonym version: how `pseudonym_hmac` was derived (issue #177).
    pseudonym_version: int = 1
