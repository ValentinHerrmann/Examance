"""CSRF backstop — reject state-changing requests from unlisted origins."""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.middleware.cors import is_allowed_origin

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

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method in _STATE_CHANGING:
            origin = request.headers.get("origin")
            if origin is not None and not is_allowed_origin(origin):
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Origin not allowed.", "code": "ERR_ORIGIN_REJECTED"},
                )
        return await call_next(request)
