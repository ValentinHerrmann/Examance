"""Training router — opt-in, anonymous OMR training-data donation.

Public by design: teachers in ``all-local`` mode may have no account at all, and
a donation must not be linkable to one. Consequences, all deliberate:

- No auth dependency, and no path in here may ever answer 401 — the client
  treats a 401 as an expired session and would start a token refresh.
- No audit entry per upload (the audit trail stores an ip_hash), no IP or user
  agent stored; the slowapi counters are the only per-client state.
- ``TRAINING_DONATION_ENABLED=false`` turns both endpoints off (404 / enabled=false).
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.middleware.rate_limit import limiter
from app.models.omr_training_sample import OmrTrainingSample
from app.schemas.binary import decode_b64
from app.schemas.training import (
    OMR_CROP_BYTES,
    OMR_CROP_HEIGHT,
    OMR_CROP_WIDTH,
    OmrSampleBatch,
    TrainingStatus,
)

router = APIRouter(prefix="/training", tags=["training"])


@router.get("/status")
@limiter.limit("60/minute")
async def training_status(request: Request) -> TrainingStatus:  # request: required by slowapi
    """Whether this deployment accepts training-data donations."""
    return TrainingStatus(enabled=settings.TRAINING_DONATION_ENABLED)


@router.post("/omr-samples", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/hour")
async def donate_omr_samples(
    request: Request,  # Required by slowapi for rate limiting
    body: OmrSampleBatch,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Store a batch of anonymous, teacher-verified checkbox crops."""
    if not settings.TRAINING_DONATION_ENABLED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")

    rows = [
        OmrTrainingSample(
            schema_version=sample.schema_version,
            algorithm_version=sample.algorithm_version,
            label_selected=sample.label_selected,
            crop_width=OMR_CROP_WIDTH,
            crop_height=OMR_CROP_HEIGHT,
            crop=decode_b64(sample.crop_b64, "crop_b64", expected_len=OMR_CROP_BYTES),
            meta={
                "detected_state": sample.detected_state,
                "provisional": sample.provisional,
                "alt_state": sample.alt_state,
                "reasons": list(sample.reasons),
                "has_redo_zone": sample.has_redo_zone,
                "features": sample.features.model_dump(),
            },
        )
        for sample in body.samples
    ]
    db.add_all(rows)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
