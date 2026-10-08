"""Privacy router: public, read-only facts for the privacy statement (frontend /legal/datenschutz).

Read from the live settings, so the published periods cannot drift from what retention enforces."""
from __future__ import annotations

from fastapi import APIRouter, Request

from app.config import settings
from app.middleware.rate_limit import limiter
from app.schemas.privacy import RetentionPeriods

router = APIRouter(prefix="/privacy", tags=["privacy"])


@router.get("/retention")
@limiter.limit("60/minute")
async def retention_periods(request: Request) -> RetentionPeriods:  # request: required by slowapi
    """Configured retention periods. Public: no session, no personal data."""
    return RetentionPeriods(
        grace_days=settings.RETENTION_GRACE_DAYS,
        audit_log_days=settings.AUDIT_LOG_RETENTION_DAYS,
        registration_link_hours=settings.REGISTRATION_TOKEN_TTL_HOURS,
        pending_account_days=settings.PENDING_ACCOUNT_RETENTION_DAYS,
        contribution_days=settings.CONTRIBUTION_RETENTION_DAYS,
        contribution_pending_days=settings.CONTRIBUTION_PENDING_MAX_DAYS,
        training_sample_days=settings.TRAINING_SAMPLE_RETENTION_DAYS,
    )
