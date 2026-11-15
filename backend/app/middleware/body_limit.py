"""Request body size enforcement middleware."""
from __future__ import annotations

from collections.abc import Callable

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import Message

from app.config import settings

# First match wins, so the order matters (e.g. a share's review and content paths before the share list).
_RULES: tuple[tuple[Callable[[str, str], bool], str], ...] = (
    (lambda p, _m: p.startswith("/api/v1/compile"), "BODY_LIMIT_COMPILE"),
    (lambda p, _m: p.startswith("/api/v1/training"), "BODY_LIMIT_TRAINING"),
    (lambda p, _m: p == "/api/v1/layout-reports", "BODY_LIMIT_LAYOUT_REPORT"),
    (lambda p, _m: p.endswith("/resources") or "/resources/" in p or p.endswith("/logo"), "BODY_LIMIT_RESOURCE"),
    (lambda p, m: "/omr-template-pins/" in p and m == "PUT", "BODY_LIMIT_OMR_PIN"),
    (lambda p, _m: p == "/api/v1/integrations/artemis/files", "BODY_LIMIT_INTEGRATION_FILE"),
    (lambda p, _m: "/shares/" in p and "/review" in p, "BODY_LIMIT_SHARE_REVIEW"),
    (lambda p, _m: p.endswith("/content") and "/shares/" in p, "BODY_LIMIT_RESULT_SHARE"),
    (lambda p, m: p.endswith("/shares") and m == "POST", "BODY_LIMIT_RESULT_SHARE"),
    (lambda p, m: "/submissions" in p and m == "POST", "BODY_LIMIT_SUBMISSION"),
    (lambda p, m: "/students" in p and m == "POST", "BODY_LIMIT_STUDENTS"),
)


class BodyLimitMiddleware(BaseHTTPMiddleware):
    """Enforce per-route request body size limits, rejecting oversized requests with HTTP 413. Content-Length is only an early reject (untrusted, absent on chunked uploads), so the limit is also enforced while the body streams."""

    def _get_limit(self, path: str, method: str) -> int:
        if method not in ("POST", "PATCH", "PUT"):
            return settings.BODY_LIMIT_DEFAULT
        for matches, setting in _RULES:
            if matches(path, method):
                return int(getattr(settings, setting))
        return settings.BODY_LIMIT_DEFAULT

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        limit = self._get_limit(request.url.path, request.method)

        too_large = JSONResponse(
            status_code=413,
            content={"detail": "Payload too large.", "code": "ERR_PAYLOAD_TOO_LARGE"},
        )

        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                declared = int(content_length)
            except ValueError:
                return JSONResponse(
                    status_code=400,
                    content={"detail": "Invalid Content-Length.", "code": "ERR_BAD_REQUEST"},
                )
            if declared > limit:
                return too_large

        received = 0
        exceeded = False
        original_receive = request.receive

        async def limited_receive() -> Message:
            """Stop feeding the body downstream once the limit is passed. Raising would surface as a generic 400; instead the stream is cut short and dispatch replaces the response with a 413."""
            nonlocal received, exceeded
            message = await original_receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    exceeded = True
                    return {"type": "http.request", "body": b"", "more_body": False}
            return message

        request._receive = limited_receive

        response = await call_next(request)
        if exceeded:
            return too_large
        return response
