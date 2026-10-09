"""Public retention periods for the privacy statement (frontend /legal/datenschutz)."""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.config import settings


@pytest.mark.asyncio
async def test_retention_periods_are_public_and_follow_settings(client: AsyncClient) -> None:
    """Shown before any sign-in, and must report what the retention job enforces."""
    client.cookies.clear()

    res = await client.get("/api/v1/privacy/retention")

    assert res.status_code == 200
    assert res.json() == {
        "grace_days": settings.RETENTION_GRACE_DAYS,
        "audit_log_days": settings.AUDIT_LOG_RETENTION_DAYS,
        "registration_link_hours": settings.REGISTRATION_TOKEN_TTL_HOURS,
        "pending_account_days": settings.PENDING_ACCOUNT_RETENTION_DAYS,
        "contribution_days": settings.CONTRIBUTION_RETENTION_DAYS,
        "contribution_pending_days": settings.CONTRIBUTION_PENDING_MAX_DAYS,
        "training_sample_days": settings.TRAINING_SAMPLE_RETENTION_DAYS,
    }
