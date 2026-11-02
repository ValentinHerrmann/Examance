"""Result sharing with students (issue #207): the server only ever sees ciphertext, a lookup hash and an expiry."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ShareFactor = Literal["none", "sticker", "code"]
_HEX64 = r"^[0-9a-f]{64}$"


class ResultShareCreate(BaseModel):
    id: uuid.UUID
    student_key: str = Field(pattern=_HEX64)
    lookup_hash: str = Field(pattern=_HEX64)
    factor: ShareFactor
    kdf_salt_b64: str | None = None
    iv_b64: str
    ciphertext_b64: str
    expiry_days: int


class ResultShareOut(BaseModel):
    id: uuid.UUID
    student_key: str
    factor: ShareFactor
    size: int
    created_at: datetime
    expires_at: datetime


class ResultShareOpen(BaseModel):
    # base64 of the 32-byte lookup secret the link derives.
    lookup_b64: str = Field(min_length=40, max_length=48)


class ResultShareContent(BaseModel):
    factor: ShareFactor
    kdf_salt_b64: str | None
    iv_b64: str
    ciphertext_b64: str
    expires_at: datetime
