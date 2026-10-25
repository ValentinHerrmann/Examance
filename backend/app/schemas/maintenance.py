"""Maintenance-window schemas (issue #130). The public status carries no personal data."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.services.maintenance import DowntimeClass, Phase


class MaintenanceStatus(BaseModel):
    phase: Phase
    kind: Literal["manual", "deployment"] | None = None
    downtime_class: DowntimeClass | None = None
    revision: int | None = None
    first_warning_at: datetime | None = None
    second_warning_at: datetime | None = None
    starts_at: datetime | None = None
    # Clients count down against the server's clock, not their own.
    server_time: datetime


class MaintenanceReadyRequest(BaseModel):
    revision: int = Field(ge=1)


class MaintenanceStartNowRequest(BaseModel):
    revision: int = Field(ge=1)


class MaintenanceStartRequest(BaseModel):
    lead_minutes: int = Field(ge=0, le=1440)
    downtime_class: DowntimeClass
    backup: bool = True


class PresenceCountsResponse(BaseModel):
    # None: the presence store is unreachable, so the count is unknown (never shown as 0).
    online: int | None
    warned: int | None
    ready: int | None


class AdminMaintenanceResponse(BaseModel):
    status: MaintenanceStatus
    backup_wanted: bool = False
    backup_state: Literal["running", "done", "failed"] | None = None
    backup_file: str | None = None
    backup_finished_at: datetime | None = None
    offsite_state: Literal["skipped", "running", "done", "failed"] | None = None
    counts: PresenceCountsResponse
