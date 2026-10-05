"""Training router — opt-in OMR training-data donation.

Donating needs a full session: accounts are approved by an admin (or come from a
domain an admin allow-listed) before they hold any token, so a public write into
the production database cannot be abused by anyone who merely finds the URL. The
stored rows stay unlinked all the same — deliberately:

- The teacher is used for the daily quota and nothing else: no teacher column,
  no audit entry (the audit trail stores an ip_hash), no log line. The quota key
  is a SHA-256 of the account id and expires with the day.
- Quota answers are 429 *without* ``Retry-After``: the client starts its login
  lockout on any 429 that carries one. For the same reason there is no slowapi
  limit on the POST.
- ``TRAINING_DONATION_ENABLED=false`` turns donating off (404 / enabled=false).
"""
from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_teacher
from app.middleware.rate_limit import limiter
from app.models.omr_training_sample import OmrTrainingSample
from app.models.teacher import Teacher
from app.schemas.binary import decode_b64
from app.schemas.training import (
    OMR_CROP_BYTES,
    OMR_CROP_HEIGHT,
    OMR_CROP_WIDTH,
    OmrSampleBatch,
    TrainingStatus,
)
from app.services import ephemeral_store

router = APIRouter(prefix="/training", tags=["training"])

_QUOTA_PREFIX = "train:q:"
_DAY_SECONDS = 24 * 60 * 60


def _quota_exceeded() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Daily training-sample quota reached.",
        headers={"code": "ERR_TRAINING_QUOTA"},
    )


@router.get("/status")
@limiter.limit("60/minute")
async def training_status(request: Request) -> TrainingStatus:  # request: required by slowapi
    """Whether this deployment accepts training-data donations. Public, read-only."""
    return TrainingStatus(
        enabled=settings.TRAINING_DONATION_ENABLED,
        retention_days=settings.TRAINING_SAMPLE_RETENTION_DAYS,
    )


@router.post("/omr-samples", status_code=status.HTTP_204_NO_CONTENT)
async def donate_omr_samples(
    body: OmrSampleBatch,
    teacher: Annotated[Teacher, Depends(get_current_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Store a batch of teacher-verified checkbox crops, unlinked from the account."""
    if not settings.TRAINING_DONATION_ENABLED:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found.")

    n = len(body.samples)
    now = datetime.now(tz=UTC)

    # Per account, per UTC day. Hashed: the key must not name the account.
    account_hash = hashlib.sha256(str(teacher.id).encode("ascii")).hexdigest()
    quota_key = f"{_QUOTA_PREFIX}{account_hash}:{now.date().isoformat()}"
    used = await ephemeral_store.get(quota_key) or 0
    if used + n > settings.TRAINING_SAMPLES_PER_TEACHER_PER_DAY:
        raise _quota_exceeded()

    # All accounts together — a backstop that holds even when Redis is down.
    today_total = await db.scalar(
        select(func.count())
        .select_from(OmrTrainingSample)
        .where(OmrTrainingSample.created_on == now.date())
    )
    if (today_total or 0) + n > settings.TRAINING_SAMPLES_PER_DAY_MAX:
        raise _quota_exceeded()

    crops = [
        decode_b64(sample.crop_b64, "crop_b64", expected_len=OMR_CROP_BYTES)
        for sample in body.samples
    ]

    # A known token means the teacher changed the verified label: replace the row.
    tokens = [s.sample_token for s in body.samples if s.sample_token is not None]
    if tokens:
        await db.execute(
            delete(OmrTrainingSample).where(OmrTrainingSample.sample_token.in_(tokens))
        )

    db.add_all(
        OmrTrainingSample(
            sample_token=sample.sample_token,
            schema_version=sample.schema_version,
            algorithm_version=sample.algorithm_version,
            label_selected=sample.label_selected,
            crop_width=OMR_CROP_WIDTH,
            crop_height=OMR_CROP_HEIGHT,
            crop=crop,
            meta={
                "detected_state": sample.detected_state,
                "provisional": sample.provisional,
                "alt_state": sample.alt_state,
                "reasons": list(sample.reasons),
                "has_redo_zone": sample.has_redo_zone,
                "features": sample.features.model_dump(),
            },
        )
        for sample, crop in zip(body.samples, crops, strict=True)
    )
    await db.commit()
    await ephemeral_store.set(quota_key, used + n, _DAY_SECONDS)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
