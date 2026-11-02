"""CSRF backstop — reject state-changing requests from origins other than the frontend's."""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.middleware.cors import is_allowed_origin

_STATE_CHANGING = frozenset({"POST", "PUT", "PATCH", "DELETE"})


class OriginGuardMiddleware(BaseHTTPMiddleware):
    """Reject state-changing requests with a foreign ``Origin`` header (CSRF). Cookies are `SameSite=Strict` and the API is same-site with the frontend, so this is defence in depth; CORS blocks reading a response, not sending the request. A missing Origin passes: non-browser clients (curl, CLI) are not CSRF-reachable."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method in _STATE_CHANGING:
            origin = request.headers.get("origin")
            if origin is not None and not is_allowed_origin(origin):
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Origin not allowed.", "code": "ERR_ORIGIN_REJECTED"},
                )
        return await call_next(request)
