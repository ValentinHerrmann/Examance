"""Request body size enforcement middleware."""
from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.config import settings


class BodyLimitMiddleware(BaseHTTPMiddleware):
    """
    Enforce per-route request body size limits.

    Rejects oversized requests with HTTP 413.

    The Content-Length header is checked first as a cheap early reject, but it
    is neither trustworthy nor always present: a chunked request carries no
    Content-Length at all. The limit is therefore also enforced while the body
    streams, so an unbounded chunked upload cannot slip past the header check.
    """

    def _get_limit(self, path: str, method: str) -> int:
        if method not in ("POST", "PATCH", "PUT"):
            return settings.BODY_LIMIT_DEFAULT
        if path.startswith("/api/v1/compile"):
            return settings.BODY_LIMIT_COMPILE
        if "/submissions" in path and method == "POST":
            return settings.BODY_LIMIT_SUBMISSION
        if "/students" in path and method == "POST":
            return settings.BODY_LIMIT_STUDENTS
        return settings.BODY_LIMIT_DEFAULT

    async def dispatch(self, request: Request, call_next: object) -> Response:
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

        async def limited_receive() -> dict:
            """
            Stop feeding the body downstream once the limit is passed.

            Raising here would surface as Starlette's generic "error parsing the
            body" 400. Instead the stream is cut short — the handler fails fast
            on the truncated body — and dispatch replaces whatever it returned
            with a 413 below.
            """
            nonlocal received, exceeded
            message = await original_receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    exceeded = True
                    return {"type": "http.request", "body": b"", "more_body": False}
            return message

        request._receive = limited_receive  # type: ignore[assignment]

        response: Response = await call_next(request)  # type: ignore[operator]
        if exceeded:
            return too_large
        return response
