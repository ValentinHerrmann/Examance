"""Schemas for the opt-in OMR training-data donation (anonymous checkbox crops)."""
from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

# Must match frontend/src/lib/grading/omrTrainingSample.ts.
OMR_CROP_WIDTH = 80
OMR_CROP_HEIGHT = 48
OMR_CROP_BYTES = OMR_CROP_WIDTH * OMR_CROP_HEIGHT  # 8-bit grayscale, row-major

OmrBoxState = Literal["blank", "ambiguous", "marked", "undone", "redone"]
OmrReason = Literal["solid", "spill", "faint", "thin", "redo"]

# Public, unauthenticated input: reject anything not explicitly modelled, and
# NaN/Infinity, so nothing unexpected (least of all an identifier) is stored.
_STRICT = ConfigDict(extra="forbid", allow_inf_nan=False)


class OmrSampleFeatures(BaseModel):
    model_config = _STRICT

    fill: float = Field(ge=0, le=1)
    redo_ratio: float | None = Field(default=None, ge=0, le=1)
    min_cell_fill: float = Field(ge=0, le=1)
    cell_evenness: float = Field(ge=0, le=1)
    ring_fill: float = Field(ge=0, le=1)
    spill_excess: float | None = Field(default=None, ge=-1, le=1)
    ink_contrast: float = Field(ge=0, le=1)
    stroke_span: float = Field(ge=0, le=1)
    stroke_frac: float = Field(ge=0, le=1)
    redo_near_frac: float | None = Field(default=None, ge=0, le=1)
    snap_dx: float = Field(ge=-1, le=1)
    snap_dy: float = Field(ge=-1, le=1)
    border_found: bool
    bg: int = Field(ge=0, le=255)


class OmrSampleIn(BaseModel):
    model_config = _STRICT

    schema_version: Literal[1]
    algorithm_version: int = Field(ge=1, le=1000)
    # The teacher-verified decision — the training label.
    label_selected: bool
    detected_state: OmrBoxState
    provisional: bool | None = None
    # Verdict of the non-deciding detection algorithm (shadow run), if recorded.
    alt_state: OmrBoxState | None = None
    reasons: list[OmrReason] = Field(default_factory=list, max_length=5)
    has_redo_zone: bool
    # base64 of exactly OMR_CROP_BYTES grayscale bytes (checked on decode).
    crop_b64: str = Field(min_length=1, max_length=6000)
    features: OmrSampleFeatures
    # Random per-box id from the browser: a re-donation with the same token replaces
    # the earlier row (the teacher corrected the label). Not derived from any id.
    sample_token: uuid.UUID | None = None


class OmrSampleBatch(BaseModel):
    model_config = _STRICT

    samples: list[OmrSampleIn] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def _tokens_unique(self) -> OmrSampleBatch:
        tokens = [s.sample_token for s in self.samples if s.sample_token is not None]
        if len(tokens) != len(set(tokens)):
            raise ValueError("sample_token must be unique within a batch")
        return self


class TrainingStatus(BaseModel):
    enabled: bool
    # Shown in the privacy notice instead of a placeholder.
    retention_days: int
