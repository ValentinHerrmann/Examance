"""Relay to an Artemis server (issue #209): student list, one-to-one chat messages and PDF uploads. The teacher's Artemis JWT lives only in the request: never log, store or echo it, and never log response bodies."""
from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.config import settings

logger = logging.getLogger(__name__)

# Per phase, plus a deadline per operation below the frontend's 25 s request timeout and any proxy limit.
_TIMEOUT = httpx.Timeout(15.0, connect=8.0)
DEADLINE_SECONDS = 20.0

# Upstream failures answer 424, never 502/504: a proxy in front (Cloudflare, Caddy) may replace a 5xx with its own page without CORS headers, and the browser then shows a CORS error instead of the cause.
_UPSTREAM_STATUS = status.HTTP_424_FAILED_DEPENDENCY


def _error(status_code: int, detail: str, code: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail=detail, headers={"code": code})


def check_host(host: str) -> str:
    """The bare, lowercase hostname if it is on `ARTEMIS_ALLOWED_HOSTS`, else 400 (never a request proxy)."""
    clean = host.strip().lower()
    allowed = {h.strip().lower() for h in settings.ARTEMIS_ALLOWED_HOSTS}
    if not clean or clean not in allowed:
        raise _error(
            status.HTTP_400_BAD_REQUEST,
            "This Artemis server is not allowed.",
            "ERR_ARTEMIS_HOST_NOT_ALLOWED",
        )
    return clean


def base_url(host: str) -> str:
    return f"https://{check_host(host)}/api/"


def _upstream_error(detail: str = "Artemis returned an error.") -> HTTPException:
    return _error(_UPSTREAM_STATUS, detail, "ERR_ARTEMIS_UPSTREAM")


async def _within_deadline[T](host: str, run: Callable[[], Awaitable[T]]) -> T:
    """Runs one relay operation so it always ends in time with a coded answer of our own."""
    try:
        async with asyncio.timeout(DEADLINE_SECONDS):
            return await run()
    except TimeoutError:
        logger.warning("Artemis relay: no answer from %s within %ss", host, DEADLINE_SECONDS)
        raise _error(_UPSTREAM_STATUS, "Artemis did not answer in time.", "ERR_ARTEMIS_TIMEOUT") from None


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=False)


async def _call(
    client: httpx.AsyncClient, step: str, method: str, url: str, jwt: str, **kwargs: Any
) -> httpx.Response:
    """One upstream request; 401/403 and login redirects become `ERR_ARTEMIS_AUTH` (400, never 401: the app would read that as an expired session), anything else `ERR_ARTEMIS_UPSTREAM`. Logs the step and status or error class only, never the token or a body."""
    host = httpx.URL(url).host
    try:
        response = await client.request(
            method,
            url,
            headers={"Authorization": f"Bearer {jwt}", "Accept": "application/json"},
            **kwargs,
        )
    # Every transport failure (DNS, TLS, proxy, reset) must end as our own coded answer.
    except Exception as exc:
        logger.warning("Artemis relay %s on %s failed: %s", step, host, type(exc).__name__)
        raise _upstream_error("Artemis is unreachable.") from None
    if response.status_code in (401, 403) or response.is_redirect:
        logger.info("Artemis relay %s on %s: token refused (%s)", step, host, response.status_code)
        raise _error(
            status.HTTP_400_BAD_REQUEST,
            "Artemis rejected the token.",
            "ERR_ARTEMIS_AUTH",
        )
    if not response.is_success:
        logger.warning("Artemis relay %s on %s: upstream status %s", step, host, response.status_code)
        raise _upstream_error()
    return response


def _json(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        raise _upstream_error() from None


def _student(raw: object) -> dict[str, Any] | None:
    if not isinstance(raw, dict) or not isinstance(raw.get("id"), int):
        return None
    last, first = raw.get("lastName"), raw.get("firstName")
    if isinstance(last, str) and isinstance(first, str) and last and first:
        name = f"{last}, {first}"
    else:
        name = str(raw.get("name") or last or first or "")
    login, email = raw.get("login"), raw.get("email")
    return {
        "id": raw["id"],
        "name": name,
        "login": login if isinstance(login, str) else None,
        "email": email if isinstance(email, str) else None,
    }


async def list_students(host: str, course_id: int, jwt: str) -> list[dict[str, Any]]:
    """The course's students as `{id, name, login, email}`."""
    base = base_url(host)

    async def run() -> httpx.Response:
        async with _client() as client:
            return await _call(
                client, "students", "GET", f"{base}core/courses/{course_id}/students", jwt
            )

    data = _json(await _within_deadline(host, run))
    if isinstance(data, dict):
        data = data.get("content", data.get("students", []))
    if not isinstance(data, list):
        raise _upstream_error()
    return [s for s in map(_student, data) if s is not None]


async def open_chat(
    client: httpx.AsyncClient, base: str, course_id: int, jwt: str, user_id: int
) -> int:
    """Open (or fetch) the one-to-one chat with *user_id*; its conversation id."""
    response = await _call(
        client,
        "chat",
        "POST",
        f"{base}communication/courses/{course_id}/one-to-one-chats",
        jwt,
        json={"userId": user_id},
    )
    data = _json(response)
    if not isinstance(data, dict) or not isinstance(data.get("id"), int):
        raise _upstream_error()
    return int(data["id"])


async def post_message(
    client: httpx.AsyncClient,
    base: str,
    course_id: int,
    jwt: str,
    conversation_id: int,
    content: str,
) -> None:
    await _call(
        client,
        "message",
        "POST",
        f"{base}communication/courses/{course_id}/messages",
        jwt,
        json={
            "content": content,
            "title": "",
            "hasForwardedMessages": False,
            "conversation": {"id": conversation_id},
        },
    )


async def upload_file(
    client: httpx.AsyncClient,
    base: str,
    course_id: int,
    jwt: str,
    conversation_id: int,
    filename: str,
    data: bytes,
) -> str:
    """Upload a PDF into the conversation; the path Artemis stored it under."""
    response = await _call(
        client,
        "upload",
        "POST",
        f"{base}core/files/courses/{course_id}/conversations/{conversation_id}",
        jwt,
        files={"file": (filename, data, "application/pdf")},
    )
    try:
        parsed = response.json()
    except ValueError:
        parsed = None
    path = parsed.get("path") if isinstance(parsed, dict) else None
    if not isinstance(path, str):
        path = response.text.strip().strip('"')
    if not path:
        raise _upstream_error()
    return path


async def send_message(host: str, course_id: int, jwt: str, user_id: int, content: str) -> None:
    """Send *content* to the student in a one-to-one chat."""
    base = base_url(host)

    async def run() -> None:
        async with _client() as client:
            conversation = await open_chat(client, base, course_id, jwt, user_id)
            await post_message(client, base, course_id, jwt, conversation, content)

    await _within_deadline(host, run)


async def send_file(
    host: str,
    course_id: int,
    jwt: str,
    user_id: int,
    filename: str,
    data: bytes,
    message: str | None,
) -> None:
    """Upload the PDF into the chat and post a message linking it (with the optional *message* above)."""
    base = base_url(host)

    async def run() -> None:
        async with _client() as client:
            conversation = await open_chat(client, base, course_id, jwt, user_id)
            path = await upload_file(client, base, course_id, jwt, conversation, filename, data)
            link = f"[{filename}]({path})"
            content = f"{message}\n\n{link}" if message else link
            await post_message(client, base, course_id, jwt, conversation, content)

    await _within_deadline(host, run)
