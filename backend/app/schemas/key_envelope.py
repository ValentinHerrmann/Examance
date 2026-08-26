"""Pydantic schemas for the key-envelope endpoints."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

EnvelopeKind = Literal["password", "recovery", "passkey"]

# 16 random bytes identifying a DEK generation.
KEY_ID_BYTES = 16


class KeyEnvelopeIn(BaseModel):
    """One wrap, as produced in the browser."""

    kind: EnvelopeKind
    credential_id_b64: str | None = None
    kdf: Literal["argon2id", "hkdf"]
    kdf_salt_b64: str
    kdf_params: dict[str, int] = Field(default_factory=dict)
    wrapped_bundle_b64: str
    wrap_iv_b64: str


class KeyEnvelopeSetIn(BaseModel):
    """
    The complete envelope set for a teacher.

    Replacement is wholesale and atomic: a partially written set is a locked-out
    teacher, so the endpoint never merges.
    """

    key_id_b64: str
    envelope_version: int = 1
    envelopes: list[KeyEnvelopeIn] = Field(min_length=1)


class KeyEnvelopeOut(BaseModel):
    id: uuid.UUID
    kind: EnvelopeKind
    credential_id_b64: str | None
    kdf: str
    kdf_salt_b64: str
    kdf_params: dict[str, int]
    wrapped_bundle_b64: str
    wrap_iv_b64: str
    key_id_b64: str
    envelope_version: int
    invalidated_at: datetime | None
    created_at: datetime


class KeyEnvelopeListOut(BaseModel):
    key_id_b64: str | None
    envelopes: list[KeyEnvelopeOut]
