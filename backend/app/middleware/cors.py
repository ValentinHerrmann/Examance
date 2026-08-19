"""CORS middleware configuration — explicit origin allowlist, no wildcard."""
from __future__ import annotations

import re
from functools import lru_cache

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings


@lru_cache(maxsize=1)
def _origin_pattern() -> re.Pattern[str] | None:
    regex = settings.effective_cors_origin_regex
    return re.compile(regex) if regex else None


def is_allowed_origin(origin: str | None) -> bool:
    """
    Whether *origin* is on the CORS allowlist.

    Shared by CORSMiddleware's own configuration, the CSRF origin guard and the
    500 handler, so all three agree on what "allowed" means. fullmatch mirrors
    Starlette — a prefix match would let evil.example.com.attacker.test through.
    """
    if not origin:
        return False
    if origin in settings.CORS_ALLOWED_ORIGINS:
        return True
    pattern = _origin_pattern()
    return pattern is not None and pattern.fullmatch(origin) is not None


def add_cors_middleware(app: FastAPI) -> None:
    """
    Register CORSMiddleware with an explicit origin allowlist.

    allow_credentials=True is required for httpOnly cookie auth.
    CORS_ALLOWED_ORIGINS must be non-empty (enforced by Settings validator).
    """
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ALLOWED_ORIGINS,
        allow_origin_regex=settings.effective_cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

