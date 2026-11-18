"""slowapi rate limiting setup."""
from __future__ import annotations

from typing import Any

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings
from app.services.ephemeral_store import CONNECT_TIMEOUT_SECONDS, OPERATION_TIMEOUT_SECONDS


def _storage_options(uri: str) -> dict[str, Any]:
    """Short socket timeouts for Redis: slowapi's storage is synchronous, so a hanging connect would block the event loop."""
    if uri.startswith(("redis://", "rediss://")):
        return {"socket_connect_timeout": CONNECT_TIMEOUT_SECONDS, "socket_timeout": OPERATION_TIMEOUT_SECONDS}
    return {}


# Shared limiter, Redis-backed in production so counters span workers and survive restarts. get_remote_address trusts uvicorn's peer address: behind a proxy --forwarded-allow-ips must name it explicitly, never "*", or clients can spoof X-Forwarded-For to reset their counters.
# A Redis outage falls back to per-process in-memory counters instead of failing every limited route (sign-in included) with 500.
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.RATE_LIMIT_STORAGE_URI,
    enabled=settings.RATE_LIMIT_ENABLED,
    in_memory_fallback_enabled=True,
    swallow_errors=True,
    storage_options=_storage_options(settings.RATE_LIMIT_STORAGE_URI),
)
