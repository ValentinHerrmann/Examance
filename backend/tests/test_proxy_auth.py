"""Edge-proxy trust (issue #198): with PROXY_SHARED_SECRET set, only the frontend's proxy reaches the API, and only it may name the client address."""
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from app.config import settings
from app.middleware.proxy_auth import ProxyAuthMiddleware

SECRET = "proxy-secret-for-tests-only"  # noqa: S105


async def _whoami(request: Request) -> JSONResponse:
    return JSONResponse({"client": request.client.host if request.client else None})


def _client() -> AsyncClient:
    app = Starlette(
        routes=[
            Route("/api/health", _whoami),
            Route("/api/v1/thing", _whoami, methods=["GET", "POST"]),
        ]
    )
    transport = ASGITransport(app=ProxyAuthMiddleware(app), client=("203.0.113.9", 1234))
    return AsyncClient(transport=transport, base_url="http://origin.test")


@pytest.fixture
def secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "PROXY_SHARED_SECRET", SECRET)


@pytest.mark.asyncio
async def test_without_a_secret_configured_nothing_changes() -> None:
    async with _client() as client:
        resp = await client.get("/api/v1/thing", headers={"X-Examance-Client-IP": "198.51.100.1"})
    assert resp.status_code == 200
    assert resp.json()["client"] == "203.0.113.9"


@pytest.mark.asyncio
@pytest.mark.parametrize("presented", [None, "wrong", SECRET + "x"])
async def test_a_missing_or_wrong_secret_is_refused(secret: None, presented: str | None) -> None:
    headers = {"X-Examance-Proxy-Secret": presented} if presented else {}
    async with _client() as client:
        resp = await client.post("/api/v1/thing", headers=headers)
    assert resp.status_code == 403
    assert resp.json()["code"] == "ERR_PROXY_REJECTED"


@pytest.mark.asyncio
async def test_health_stays_reachable_for_the_deploy_check(secret: None) -> None:
    async with _client() as client:
        resp = await client.get("/api/health")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_the_client_address_comes_only_from_the_proxy(secret: None) -> None:
    async with _client() as client:
        proxied = await client.get(
            "/api/v1/thing",
            headers={"X-Examance-Proxy-Secret": SECRET, "X-Examance-Client-IP": "198.51.100.1"},
        )
        spoofed = await client.get("/api/health", headers={"X-Examance-Client-IP": "198.51.100.1"})
        garbage = await client.get(
            "/api/v1/thing",
            headers={"X-Examance-Proxy-Secret": SECRET, "X-Examance-Client-IP": "not-an-ip"},
        )
    assert proxied.json()["client"] == "198.51.100.1"
    assert spoofed.json()["client"] == "203.0.113.9"
    assert garbage.json()["client"] == "203.0.113.9"
