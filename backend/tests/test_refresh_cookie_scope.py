"""Sign-out receives the refresh cookie and revokes it; older cookies on the refresh-only path are cleared (issue #287)."""
from __future__ import annotations

from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.refresh_token import RefreshToken
from app.services.jwt import decode_token

from .factors import DEFAULT_PASSWORD, create_teacher, current_code, enrol_totp, unique_email

LEGACY_PATH = "/api/v1/auth/refresh"


def _refresh_cookies(resp: Response) -> list[str]:
    return [h for h in resp.headers.get_list("set-cookie") if h.startswith("refresh_token=")]


def _value(header: str) -> str:
    return header.split(";", 1)[0].split("=", 1)[1].strip('"')


async def _sign_in(client: AsyncClient, db: AsyncSession) -> tuple[Response, str]:
    """Sign in with password and authenticator; return the final response and its refresh token."""
    email = unique_email("cookie-scope")
    teacher = await create_teacher(db, email)
    secret = await enrol_totp(db, teacher)
    first = await client.post("/api/v1/auth/login", json={"email": email, "password": DEFAULT_PASSWORD})
    client.cookies.update(first.cookies)
    second = await client.post("/api/v1/auth/factor/totp", json={"code": current_code(secret)})
    assert second.json()["status"] == "ok", second.text
    issued = [h for h in _refresh_cookies(second) if "Max-Age=0" not in h]
    assert len(issued) == 1
    client.cookies.clear()
    return second, _value(issued[0])


async def test_the_refresh_cookie_reaches_every_auth_endpoint(client: AsyncClient, db: AsyncSession) -> None:
    resp, _ = await _sign_in(client, db)
    headers = _refresh_cookies(resp)
    assert any("Path=/api/v1/auth;" in h and "Max-Age=0" not in h for h in headers)
    # The cookie of an older session on the refresh-only path is deleted, so no session keeps two.
    assert any(f"Path={LEGACY_PATH}" in h and "Max-Age=0" in h for h in headers)


async def test_sign_out_revokes_the_refresh_token(client: AsyncClient, db: AsyncSession) -> None:
    _, token = await _sign_in(client, db)

    out = await client.post("/api/v1/auth/logout", headers={"Cookie": f"refresh_token={token}"})
    assert out.status_code == 204
    cleared = _refresh_cookies(out)
    assert any("Path=/api/v1/auth;" in h and "Max-Age=0" in h for h in cleared)
    assert any(f"Path={LEGACY_PATH}" in h and "Max-Age=0" in h for h in cleared)

    row = (
        await db.execute(
            select(RefreshToken)
            .where(RefreshToken.jti == decode_token(token)["jti"])
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    assert row.revoked is True

    replay = await client.post("/api/v1/auth/refresh", headers={"Cookie": f"refresh_token={token}"})
    assert replay.status_code == 401


async def test_a_session_with_both_cookies_rotates_the_current_one(client: AsyncClient, db: AsyncSession) -> None:
    _, stale = await _sign_in(client, db)
    _, current = await _sign_in(client, db)
    await client.post("/api/v1/auth/logout", headers={"Cookie": f"refresh_token={stale}"})
    # Browsers send the longer (legacy) path first; using that revoked one would answer 401, so the current cookie, sent last, must win.
    resp = await client.post(
        "/api/v1/auth/refresh",
        headers={"Cookie": f"refresh_token={stale}; refresh_token={current}"},
    )
    assert resp.status_code == 200, resp.text
    issued = [h for h in _refresh_cookies(resp) if "Max-Age=0" not in h]
    assert len(issued) == 1 and "Path=/api/v1/auth;" in issued[0]
