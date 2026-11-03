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
    layout_report_days: int
    # Longest lifetime a teacher may give a student's result link (issue #207).
    result_share_max_days: int
    # How long per-student delivery statuses of result mails and Artemis messages are kept (issue #221).
    delivery_status_days: int
