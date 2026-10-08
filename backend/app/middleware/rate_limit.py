"""slowapi rate limiting setup."""
from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

# Shared limiter, Redis-backed in production so counters span workers and survive restarts.
# get_remote_address trusts uvicorn's peer address: behind a proxy --forwarded-allow-ips must
# name it explicitly, never "*", or clients can spoof X-Forwarded-For to reset their counters.
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.RATE_LIMIT_STORAGE_URI,
    enabled=settings.RATE_LIMIT_ENABLED,
)
