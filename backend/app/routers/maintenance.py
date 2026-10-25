"""Maintenance router: the public status every browser polls, and "I've saved my work" (#130)."""
from __future__ import annotations

from typing import Annotated

import jwt
from fastapi import APIRouter, Cookie, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_teacher
from app.middleware.rate_limit import limiter
from app.models.teacher import Teacher
from app.schemas.maintenance import MaintenanceReadyRequest, MaintenanceStatus
from app.services import maintenance
from app.services.jwt import decode_token

router = APIRouter(prefix="/maintenance", tags=["maintenance"])


def status_of(state: maintenance.WindowState | None) -> MaintenanceStatus:
    now = maintenance.now_utc()
    phase = state.phase(now) if state is not None else "none"
    if state is None or phase == "none":
        return MaintenanceStatus(phase="none", server_time=now)
    return MaintenanceStatus(
        phase=phase,
        kind=state.kind,  # type: ignore[arg-type]
        downtime_class=state.downtime_class,  # type: ignore[arg-type]
        revision=state.revision,
        first_warning_at=state.first_warning_at,
        second_warning_at=state.second_warning_at,
        starts_at=state.starts_at,
        server_time=now,
    )


def _signed_in_teacher_id(access_token: str | None) -> str | None:
    """The teacher behind a valid full session cookie, for presence only (never authorization)."""
    if not access_token:
        return None
    try:
        payload = decode_token(access_token)
    except jwt.InvalidTokenError:
        return None
    if payload.get("type") != "access" or payload.get("scope", "full") != "full":
        return None
    if payload.get("role") == "admin":
        return None
    sub = payload.get("sub")
    return str(sub) if sub else None


@router.get("")
# Generous: a school's teachers share one address and each tab polls every 10-30 s.
@limiter.limit("600/minute")
async def maintenance_status(
    request: Request,  # required by slowapi
    db: Annotated[AsyncSession, Depends(get_db)],
    access_token: Annotated[str | None, Cookie()] = None,
) -> MaintenanceStatus:
    """Public: whether maintenance is announced or running. Signed-in teachers count as online."""
    state = await maintenance.load(db)
    body = status_of(state)
    teacher_id = _signed_in_teacher_id(access_token)
    if teacher_id is not None:
        await maintenance.record_presence(teacher_id, state, body.phase)
    return body


@router.post("/ready", status_code=status.HTTP_204_NO_CONTENT)
async def maintenance_ready(
    body: MaintenanceReadyRequest,
    teacher: Annotated[Teacher, Depends(get_current_teacher)],
) -> Response:
    """The teacher confirmed they saved their work for this window (shown to admins as a count)."""
    await maintenance.mark_ready(str(teacher.id), body.revision)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
