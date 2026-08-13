"""slowapi rate limiting setup."""
from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

# Shared limiter instance — imported by routers that need rate limiting.
#
# Storage is Redis-backed in production (RATE_LIMIT_STORAGE_URI derives from
# REDIS_URL) so counters are shared across uvicorn workers and survive restarts.
# An in-memory backend would multiply every limit by the worker count.
#
# NOTE: get_remote_address trusts the peer address uvicorn reports. Behind a
# proxy that means --forwarded-allow-ips must name the proxy explicitly, never
# "*", or clients could spoof X-Forwarded-For to reset their own counters.
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.RATE_LIMIT_STORAGE_URI,
    enabled=settings.RATE_LIMIT_ENABLED,
)
