"""Maintenance and deployment windows (issue #130): the only place that decides the phase.

Phases none -> scheduled -> warning -> final (sign-in closed) -> down (writes 503); a deployment is
down only once CI froze it. Details: docs/dev/maintenance_mode.md."""
from __future__ import annotations

import hashlib
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.maintenance_window import MaintenanceWindow
from app.services import ephemeral_store

Phase = Literal["none", "scheduled", "warning", "final", "down"]
Kind = Literal["manual", "deployment"]
DowntimeClass = Literal["very_short", "short", "long", "unspecific"]

FIRST_WARNING_SECONDS = 300
SECOND_WARNING_SECONDS = 60
# A lead up to the 2nd offset would merge both reminders; the 2nd then comes this close.
SHORT_LEAD_SECOND_WARNING_SECONDS = 10
# Safety nets for a cancelled or crashed deploy run: nobody stays locked out for good. After the
# freeze it must outlast wait-backup (15 min) plus migrate and restart.
DEPLOYMENT_AUTO_END = timedelta(minutes=15)
DEPLOYMENT_AUTO_END_AFTER_FREEZE = timedelta(minutes=45)
# What a client is told to wait, by announced duration.
_RETRY_SECONDS: dict[str, int] = {"very_short": 30, "short": 120, "long": 600, "unspecific": 300}

ONLINE_WINDOW_SECONDS = 90
_SET_TTL_SECONDS = 7200
_ONLINE_KEY = "maint:online"

_WINDOW_ID = 1
_CACHE_SECONDS = 3.0


@dataclass(frozen=True)
class WindowState:
    """A detached copy of the window, safe to cache across requests."""

    revision: int
    kind: str
    downtime_class: str
    first_warning_at: datetime
    second_warning_at: datetime
    starts_at: datetime
    frozen_at: datetime | None
    auto_end_at: datetime | None
    ended_at: datetime | None
    backup_wanted: bool
    backup_state: str | None
    backup_file: str | None
    backup_finished_at: datetime | None
    offsite_state: str | None

    def phase(self, now: datetime) -> Phase:
        if self.ended_at is not None or (self.auto_end_at is not None and now >= self.auto_end_at):
            return "none"
        if self.kind == "deployment":
            if self.frozen_at is not None:
                return "down"
        elif now >= self.starts_at:
            return "down"
        if now >= self.second_warning_at:
            return "final"
        if now >= self.first_warning_at:
            return "warning"
        return "scheduled"


def _aware(value: datetime | None) -> datetime | None:
    # SQLite (tests) hands back naive datetimes; everything stored is UTC.
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=UTC)


def _state(row: MaintenanceWindow) -> WindowState:
    return WindowState(
        revision=row.revision,
        kind=row.kind,
        downtime_class=row.downtime_class,
        first_warning_at=_aware(row.first_warning_at) or row.first_warning_at,
        second_warning_at=_aware(row.second_warning_at) or row.second_warning_at,
        starts_at=_aware(row.starts_at) or row.starts_at,
        frozen_at=_aware(row.frozen_at),
        auto_end_at=_aware(row.auto_end_at),
        ended_at=_aware(row.ended_at),
        backup_wanted=row.backup_wanted,
        backup_state=row.backup_state,
        backup_file=row.backup_file,
        backup_finished_at=_aware(row.backup_finished_at),
        offsite_state=row.offsite_state,
    )


def now_utc() -> datetime:
    return datetime.now(tz=UTC)


_cache: tuple[float, WindowState | None] | None = None


def invalidate() -> None:
    """Drop this worker's cached window; other workers catch up within _CACHE_SECONDS."""
    global _cache
    _cache = None


async def _row(db: AsyncSession) -> MaintenanceWindow | None:
    return (
        await db.execute(select(MaintenanceWindow).where(MaintenanceWindow.id == _WINDOW_ID))
    ).scalar_one_or_none()


async def load(db: AsyncSession, *, fresh: bool = False) -> WindowState | None:
    """The current window (open or not), cached briefly because every teaching request asks."""
    global _cache
    if not fresh and _cache is not None and _cache[0] > time.monotonic():
        return _cache[1]
    row = await _row(db)
    state = _state(row) if row is not None else None
    _cache = (time.monotonic() + _CACHE_SECONDS, state)
    return state


def cached_revision() -> int | None:
    """Open window's revision from this worker's fresh cache only (never a DB read)."""
    if _cache is None or _cache[0] <= time.monotonic() or _cache[1] is None:
        return None
    state = _cache[1]
    return state.revision if state.phase(now_utc()) != "none" else None


async def current_phase(db: AsyncSession) -> tuple[WindowState | None, Phase]:
    state = await load(db)
    return state, state.phase(now_utc()) if state is not None else "none"


class WindowBusyError(Exception):
    """A deployment must not replace an open manual window or a frozen deployment."""


def blocks_deployment(state: WindowState | None, now: datetime) -> bool:
    if state is None or state.phase(now) == "none":
        return False
    return state.kind == "manual" or state.frozen_at is not None


def retry_after_seconds(state: WindowState, now: datetime) -> int:
    until_start = max(0, int((state.starts_at - now).total_seconds()))
    return max(1, until_start + _RETRY_SECONDS.get(state.downtime_class, 300))


async def start(
    db: AsyncSession,
    *,
    kind: Kind,
    downtime_class: DowntimeClass,
    lead_seconds: int,
    second_warning_seconds: int = SECOND_WARNING_SECONDS,
    first_warning_seconds: int = FIRST_WARNING_SECONDS,
    backup: bool,
    started_by: uuid.UUID | None = None,
) -> WindowState:
    """Open a window, replacing any earlier one; the revision tells the two apart.

    Raises WindowBusyError for a deployment over a manual or frozen window, and for a manual one
    over a frozen deployment."""
    now = now_utc()
    current = await load(db, fresh=True)
    if (kind == "deployment" and blocks_deployment(current, now)) or (
        kind == "manual" and current is not None and current.frozen_at is not None
        and current.phase(now) != "none"
    ):
        raise WindowBusyError
    starts_at = now + timedelta(seconds=max(lead_seconds, 0))
    if lead_seconds <= second_warning_seconds:
        second_warning_seconds = min(second_warning_seconds, SHORT_LEAD_SECOND_WARNING_SECONDS)
    row = await _row(db)
    if row is None:
        row = MaintenanceWindow(id=_WINDOW_ID, revision=0)
        db.add(row)
    row.revision = (row.revision or 0) + 1
    row.kind = kind
    row.downtime_class = downtime_class
    row.starts_at = starts_at
    row.first_warning_at = max(now, starts_at - timedelta(seconds=first_warning_seconds))
    row.second_warning_at = max(now, starts_at - timedelta(seconds=second_warning_seconds))
    row.frozen_at = None
    row.auto_end_at = starts_at + DEPLOYMENT_AUTO_END if kind == "deployment" else None
    row.ended_at = None
    row.started_by_teacher_id = started_by
    row.backup_wanted = True if kind == "deployment" else backup
    row.backup_state = None
    row.backup_file = None
    row.backup_finished_at = None
    row.offsite_state = None
    await db.flush()
    invalidate()
    return _state(row)


async def freeze(db: AsyncSession, revision: int) -> bool:
    """CI: stop teaching writes for the backup and restart. False if *revision* is not open."""
    row = await _row(db)
    now = now_utc()
    if row is None or row.revision != revision or row.kind != "deployment":
        return False
    if _state(row).phase(now) == "none":
        return False
    row.frozen_at = now
    row.auto_end_at = now + DEPLOYMENT_AUTO_END_AFTER_FREEZE
    await db.flush()
    invalidate()
    return True


async def end(db: AsyncSession, revision: int | None = None) -> bool:
    """Close the open window; with *revision*, only that one (a cancelled deploy run must not end
    the window of the run that replaced it)."""
    row = await _row(db)
    if row is None or row.ended_at is not None:
        return False
    if revision is not None and row.revision != revision:
        return False
    row.ended_at = now_utc()
    await db.flush()
    invalidate()
    return True


async def ensure_teaching_allowed(db: AsyncSession, code: str = "ERR_MAINTENANCE") -> None:
    state, phase = await current_phase(db)
    if state is not None and phase == "down":
        raise HTTPException(
            # 503 on purpose: the frontend queues and replays writes on 5xx (offlineQueue.ts).
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Maintenance in progress.",
            headers={
                "code": code,
                "Retry-After": str(_RETRY_SECONDS.get(state.downtime_class, 300)),
            },
        )


async def ensure_sign_in_allowed(db: AsyncSession, role: str) -> None:
    """Sign-in closes at the second reminder. Admins stay exempt so they can end a window."""
    if role == "admin":
        return
    state, phase = await current_phase(db)
    if state is not None and phase in ("final", "down"):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Sign-in is paused for maintenance.",
            headers={
                "code": "ERR_MAINTENANCE_LOGIN_BLOCKED",
                "Retry-After": str(retry_after_seconds(state, now_utc())),
            },
        )


# Presence (aggregate only): a hash of the account id, kept ONLINE_WINDOW_SECONDS for "online" and
# _SET_TTL_SECONDS for "warned"/"ready" of one revision. Nothing else is stored.


def _member(teacher_id: str) -> str:
    return hashlib.sha256(f"maintenance-presence:{teacher_id}".encode()).hexdigest()[:32]


def _warned_key(revision: int) -> str:
    return f"maint:warned:{revision}"


def _ready_key(revision: int) -> str:
    return f"maint:ready:{revision}"


async def record_presence(teacher_id: str, state: WindowState | None, phase: Phase) -> None:
    member = _member(teacher_id)
    await ephemeral_store.mark_member(_ONLINE_KEY, member, ONLINE_WINDOW_SECONDS)
    if state is not None and phase in ("warning", "final", "down"):
        await ephemeral_store.mark_member(_warned_key(state.revision), member, _SET_TTL_SECONDS)


async def mark_ready(teacher_id: str, revision: int) -> None:
    await ephemeral_store.mark_member(_ready_key(revision), _member(teacher_id), _SET_TTL_SECONDS)


@dataclass(frozen=True)
class PresenceCounts:
    online: int | None
    warned: int | None
    ready: int | None


async def presence_counts(revision: int | None) -> PresenceCounts:
    """Teachers online now, and how many of them saw / confirmed the current window."""
    online = await ephemeral_store.members_since(_ONLINE_KEY, ONLINE_WINDOW_SECONDS)
    if online is None:
        return PresenceCounts(None, None, None)
    if revision is None:
        return PresenceCounts(len(online), None, None)
    warned = await ephemeral_store.members_since(_warned_key(revision), _SET_TTL_SECONDS)
    ready = await ephemeral_store.members_since(_ready_key(revision), _SET_TTL_SECONDS)
    here = set(online)
    return PresenceCounts(
        online=len(here),
        warned=None if warned is None else len(here.intersection(warned)),
        ready=None if ready is None else len(here.intersection(ready)),
    )
