"""Schemas for pinned OMR templates (issue #239). The payload is an opaque client-sealed blob."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class OmrTemplatePinIn(BaseModel):
    source: Literal["download", "printed"]
    payload_ciphertext_b64: str
    payload_iv_b64: str


class OmrTemplatePinOut(BaseModel):
    layout_hash: str
    source: str
    pinned_at: datetime
    last_pinned_at: datetime
    payload_ciphertext_b64: str
    payload_iv_b64: str
