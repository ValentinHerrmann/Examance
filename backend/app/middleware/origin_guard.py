"""CSRF backstop — reject state-changing requests from origins other than the frontend's."""
from __future__ import annotations

import re
from functools import lru_cache

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config import settings

_STATE_CHANGING = frozenset({"POST", "PUT", "PATCH", "DELETE"})


@lru_cache(maxsize=1)
def _dev_pattern() -> re.Pattern[str] | None:
    regex = settings.dev_origin_regex
    return re.compile(regex) if regex else None


def is_allowed_origin(origin: str | None) -> bool:
    """Whether *origin* is one of the frontend's origins (FRONTEND_ORIGINS, or loopback in development). fullmatch: a prefix match would let evil.example.com.attacker.test through."""
    if not origin:
        return False
    if origin in settings.FRONTEND_ORIGINS:
        return True
    pattern = _dev_pattern()
    return pattern is not None and pattern.fullmatch(origin) is not None


class OriginGuardMiddleware(BaseHTTPMiddleware):
    """Reject state-changing requests with a foreign ``Origin`` header (CSRF). The API is same-origin with `SameSite=Strict` cookies, so this is defence in depth. A missing Origin passes: non-browser clients (curl, CLI) are not CSRF-reachable."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method in _STATE_CHANGING:
            origin = request.headers.get("origin")
            if origin is not None and not is_allowed_origin(origin):
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Origin not allowed.", "code": "ERR_ORIGIN_REJECTED"},
                )
        return await call_next(request)
