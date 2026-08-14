"""CSRF backstop — reject state-changing requests from unlisted origins."""
from __future__ import annotations

import re

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from app.config import settings

_STATE_CHANGING = frozenset({"POST", "PUT", "PATCH", "DELETE"})


class OriginGuardMiddleware(BaseHTTPMiddleware):
    """
    Reject state-changing requests carrying a disallowed ``Origin`` header.

    Session cookies use ``SameSite=None`` because the SPA and the API live on
    different registrable domains, so the browser attaches them to cross-site
    requests. CORS already blocks an attacker from *reading* the response, and
    a JSON content type forces a preflight — but neither stops the request from
    being *sent*. This check does, and it costs one dict lookup.

    A missing Origin is allowed through: non-browser clients (curl, the CLI,
    server-to-server calls) do not send one, and those are not CSRF-reachable.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)
        self._allowed = frozenset(settings.CORS_ALLOWED_ORIGINS)
        self._pattern = (
            re.compile(settings.effective_cors_origin_regex)
            if settings.effective_cors_origin_regex
            else None
        )

    def _is_allowed(self, origin: str) -> bool:
        if origin in self._allowed:
            return True
        # fullmatch, mirroring Starlette's CORSMiddleware — a prefix match would
        # let evil.valentin-herrmann.com.attacker.test through.
        return self._pattern is not None and self._pattern.fullmatch(origin) is not None

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method in _STATE_CHANGING:
            origin = request.headers.get("origin")
            if origin is not None and not self._is_allowed(origin):
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Origin not allowed.", "code": "ERR_ORIGIN_REJECTED"},
                )
        return await call_next(request)
