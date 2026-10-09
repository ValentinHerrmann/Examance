"""Public retention periods for the privacy statement: configuration only, no personal data."""
from __future__ import annotations

from pydantic import BaseModel


class RetentionPeriods(BaseModel):
    grace_days: int
    audit_log_days: int
    registration_link_hours: int
    pending_account_days: int
    contribution_days: int
    contribution_pending_days: int
    training_sample_days: int
