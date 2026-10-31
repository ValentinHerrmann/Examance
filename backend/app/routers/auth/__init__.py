"""Auth router — /api/v1/auth/* `session` (sign-in, refresh, logout, change-password), `recovery` (password reset) and `registration` (self-registration, self-deletion). Other routers import `advance_sign_in` and `reissue_pending_headers` from here."""
from __future__ import annotations

from fastapi import APIRouter

from app.routers.auth import recovery, registration, session
from app.routers.auth.session import (
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    advance_sign_in,
    reissue_pending_headers,
)

router = APIRouter(prefix="/auth", tags=["auth"])
# Registration order is the path order of docs/openapi.json, which CI diffs byte for byte.
router.include_router(recovery.forgot_router)
router.include_router(registration.router)
router.include_router(recovery.reset_router)
router.include_router(session.router)

__all__ = [
    "ACCESS_COOKIE",
    "REFRESH_COOKIE",
    "advance_sign_in",
    "reissue_pending_headers",
    "router",
]
