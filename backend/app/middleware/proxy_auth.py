"""Edge-proxy trust (issue #198): with PROXY_SHARED_SECRET set, the API answers only requests the frontend's proxy forwarded, and takes the client address from that proxy."""
from __future__ import annotations

import hmac
import ipaddress

from starlette.types import ASGIApp, Receive, Scope, Send

from app.config import settings

SECRET_HEADER = b"x-examance-proxy-secret"
CLIENT_IP_HEADER = b"x-examance-client-ip"

# The deploy health check calls the origin directly; it reveals only status and version.
_EXEMPT = {("GET", "/api/health"), ("HEAD", "/api/health")}


def _client_ip(value: bytes) -> str | None:
    try:
        return str(ipaddress.ip_address(value.decode("ascii").strip()))
    except (UnicodeDecodeError, ValueError):
        return None


class ProxyAuthMiddleware:
    """Outermost middleware, so rate limits, login throttling and the audit log all see the real client. Without the secret anyone could call the origin directly and claim any address."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        secret = settings.PROXY_SHARED_SECRET
        if scope["type"] != "http" or not secret:
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        presented = headers.get(SECRET_HEADER, b"")
        if not hmac.compare_digest(presented, secret.encode()):
            if (scope.get("method"), scope.get("path")) in _EXEMPT:
                await self.app(scope, receive, send)
                return
            await _reject(send)
            return

        ip = _client_ip(headers.get(CLIENT_IP_HEADER, b""))
        if ip is not None:
            scope = {**scope, "client": (ip, 0)}
        await self.app(scope, receive, send)


async def _reject(send: Send) -> None:
    body = b'{"detail":"Not served through the frontend.","code":"ERR_PROXY_REJECTED"}'
    await send(
        {
            "type": "http.response.start",
            "status": 403,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})
