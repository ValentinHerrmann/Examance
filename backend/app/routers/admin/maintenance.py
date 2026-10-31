"""Admin: maintenance windows (issue #130) — /api/v1/admin/maintenance*"""
from __future__ import annotations

from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_admin_teacher
from app.models.teacher import Teacher
from app.routers.maintenance import status_of as maintenance_status_of
from app.schemas.maintenance import (
    AdminMaintenanceResponse,
    MaintenanceStartNowRequest,
    MaintenanceStartRequest,
    PresenceCountsResponse,
)
from app.services import audit as audit_svc
from app.services import maintenance as maintenance_svc

router = APIRouter()


async def _maintenance_out(db: AsyncSession) -> AdminMaintenanceResponse:
    state = await maintenance_svc.load(db, fresh=True)
    body = maintenance_status_of(state)
    counts = await maintenance_svc.presence_counts(body.revision)
    response = AdminMaintenanceResponse(
        status=body,
        counts=PresenceCountsResponse(
            online=counts.online, warned=counts.warned, ready=counts.ready
        ),
    )
    if state is not None and body.phase != "none":
        response.backup_wanted = state.backup_wanted
        response.backup_state = cast(Any, state.backup_state)
        response.backup_file = state.backup_file
        response.backup_finished_at = state.backup_finished_at
        response.offsite_state = cast(Any, state.offsite_state)
    return response


@router.get("/maintenance")
async def get_maintenance(
    _admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminMaintenanceResponse:
    """The current window, its backup, and how many teachers are online / warned / ready."""
    return await _maintenance_out(db)


@router.post("/maintenance")
async def start_maintenance(
    body: MaintenanceStartRequest,
    request: Request,
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminMaintenanceResponse:
    """Announce manual maintenance in `lead_minutes` (0 = now); replaces an open manual window."""
    try:
        state = await maintenance_svc.start(
            db,
            kind="manual",
            downtime_class=body.downtime_class,
            lead_seconds=body.lead_minutes * 60,
            backup=body.backup,
            started_by=admin.id,
        )
    except maintenance_svc.WindowBusyError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An update is being deployed right now; try again when it is done.",
            headers={"code": "ERR_MAINTENANCE_DEPLOYMENT_RUNNING"},
        ) from None
    await audit_svc.log(db, request, admin, "MAINTENANCE_STARTED", f"maintenance:{state.revision}")
    await db.flush()
    return await _maintenance_out(db)


@router.post("/maintenance/start-now")
async def start_maintenance_now(
    body: MaintenanceStartNowRequest,
    request: Request,
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminMaintenanceResponse:
    """Cut the countdown of the open window short, e.g. when nobody is online (issue #149)."""
    state = await maintenance_svc.start_now(db, body.revision)
    if state is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The maintenance has already started or ended.",
            headers={"code": "ERR_MAINTENANCE_NOT_PENDING"},
        )
    await audit_svc.log(
        db, request, admin, "MAINTENANCE_STARTED_EARLY", f"maintenance:{state.revision}"
    )
    await db.flush()
    return await _maintenance_out(db)


@router.delete("/maintenance")
async def end_maintenance(
    request: Request,
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminMaintenanceResponse:
    """End the open window (manual or deployment); teachers can work and sign in again."""
    state = await maintenance_svc.load(db, fresh=True)
    if await maintenance_svc.end(db):
        await audit_svc.log(
            db, request, admin, "MAINTENANCE_ENDED", f"maintenance:{state.revision if state else 0}"
        )
        await db.flush()
    return await _maintenance_out(db)
