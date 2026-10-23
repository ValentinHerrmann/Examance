"""Tell every API response's client which maintenance window is open (issue #130)."""
from __future__ import annotations

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.services import maintenance

HEADER = b"maintenance-revision"


class MaintenanceHeaderMiddleware:
    """Active clients learn of a window with their next request instead of waiting for the poll.

    Reads only the per-worker cache (filled by teaching requests and the status poll);
    no header means "unknown", never "no window". The revision is public (GET /maintenance).
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope["path"].startswith("/api/"):
            await self.app(scope, receive, send)
            return

        async def send_with_header(message: Message) -> None:
            if message["type"] == "http.response.start":
                revision = maintenance.cached_revision()
                if revision is not None:
                    message.setdefault("headers", [])
                    message["headers"] = [*message["headers"], (HEADER, str(revision).encode())]
            await send(message)

        await self.app(scope, receive, send_with_header)
