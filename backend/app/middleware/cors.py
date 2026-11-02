"""CORS middleware configuration — explicit origin allowlist (FRONTEND_ORIGINS), no wildcard."""
from __future__ import annotations

import re
from functools import lru_cache

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings


@lru_cache(maxsize=1)
def _dev_pattern() -> re.Pattern[str] | None:
    regex = settings.dev_origin_regex
    return re.compile(regex) if regex else None


def is_allowed_origin(origin: str | None) -> bool:
    """Whether *origin* is one of the frontend's origins (FRONTEND_ORIGINS, or loopback in development); shared by CORSMiddleware, the origin guard and the 500 handler so all three agree. fullmatch: a prefix match would let evil.example.com.attacker.test through."""
    if not origin:
        return False
    if origin in settings.FRONTEND_ORIGINS:
        return True
    pattern = _dev_pattern()
    return pattern is not None and pattern.fullmatch(origin) is not None


def add_cors_middleware(app: FastAPI) -> None:
    """Register CORSMiddleware for the frontend's origins. The API sits on the same site (`api.<frontend host>` or PUBLIC_API_URL, issue #198) but another origin, so credentialed CORS is still needed."""
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.FRONTEND_ORIGINS,
        allow_origin_regex=settings.dev_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        # Routers send the error code as a response header (``code``); cross-origin it is unreadable unless exposed here, which would hide errors.code.* localization and Retry-After from the SPA.
        expose_headers=["code", "Retry-After", "Maintenance-Revision"],
    )
