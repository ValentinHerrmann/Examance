"""Admin router — /api/v1/admin/* `users` (accounts, factor reset, audit log), `domains` (auto-approved email domains) and `maintenance` (maintenance windows)."""
from __future__ import annotations

from fastapi import APIRouter

from app.routers.admin import domains, maintenance, users

router = APIRouter(prefix="/admin", tags=["admin"])
# Registration order is the path order of docs/openapi.json, which CI diffs byte for byte.
router.include_router(users.router)
router.include_router(domains.router)
router.include_router(users.security_router)
router.include_router(maintenance.router)

__all__ = ["router"]
