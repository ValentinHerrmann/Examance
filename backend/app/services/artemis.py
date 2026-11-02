"""Relay to an Artemis server (issue #209): student list, one-to-one chat messages and PDF uploads. The teacher's Artemis JWT lives only in the request: never log, store or echo it, and never log response bodies."""
from __future__ import annotations

from typing import Any

import httpx
from fastapi import HTTPException, status

from app.config import settings

_TIMEOUT = 30.0


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


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=False)


async def _call(
    client: httpx.AsyncClient, method: str, url: str, jwt: str, **kwargs: Any
) -> httpx.Response:
    """One upstream request; 401/403 become `ERR_ARTEMIS_AUTH` (400, never 401: the app would read that as an expired session), anything else that fails 502."""
    try:
        response = await client.request(
            method,
            url,
            headers={"Authorization": f"Bearer {jwt}", "Accept": "application/json"},
            **kwargs,
        )
    except httpx.HTTPError:
        raise _error(
            status.HTTP_502_BAD_GATEWAY, "Artemis is unreachable.", "ERR_ARTEMIS_UPSTREAM"
        ) from None
    if response.status_code in (401, 403):
        raise _error(
            status.HTTP_400_BAD_REQUEST,
            "Artemis rejected the token.",
            "ERR_ARTEMIS_AUTH",
        )
    if not response.is_success:
        raise _error(
            status.HTTP_502_BAD_GATEWAY, "Artemis returned an error.", "ERR_ARTEMIS_UPSTREAM"
        )
    return response


def _json(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        raise _error(
            status.HTTP_502_BAD_GATEWAY, "Artemis returned an error.", "ERR_ARTEMIS_UPSTREAM"
        ) from None


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
    async with _client() as client:
        response = await _call(client, "GET", f"{base}core/courses/{course_id}/students", jwt)
    data = _json(response)
    if isinstance(data, dict):
        data = data.get("content", data.get("students", []))
    if not isinstance(data, list):
        raise _error(
            status.HTTP_502_BAD_GATEWAY, "Artemis returned an error.", "ERR_ARTEMIS_UPSTREAM"
        )
    return [s for s in map(_student, data) if s is not None]


async def open_chat(
    client: httpx.AsyncClient, base: str, course_id: int, jwt: str, user_id: int
) -> int:
    """Open (or fetch) the one-to-one chat with *user_id*; its conversation id."""
    response = await _call(
        client,
        "POST",
        f"{base}communication/courses/{course_id}/one-to-one-chats",
        jwt,
        json={"userId": user_id},
    )
    data = _json(response)
    if not isinstance(data, dict) or not isinstance(data.get("id"), int):
        raise _error(
            status.HTTP_502_BAD_GATEWAY, "Artemis returned an error.", "ERR_ARTEMIS_UPSTREAM"
        )
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
        raise _error(
            status.HTTP_502_BAD_GATEWAY, "Artemis returned an error.", "ERR_ARTEMIS_UPSTREAM"
        )
    return path


async def send_message(host: str, course_id: int, jwt: str, user_id: int, content: str) -> None:
    """Send *content* to the student in a one-to-one chat."""
    base = base_url(host)
    async with _client() as client:
        conversation = await open_chat(client, base, course_id, jwt, user_id)
        await post_message(client, base, course_id, jwt, conversation, content)


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
    async with _client() as client:
        conversation = await open_chat(client, base, course_id, jwt, user_id)
        path = await upload_file(client, base, course_id, jwt, conversation, filename, data)
        link = f"[{filename}]({path})"
        content = f"{message}\n\n{link}" if message else link
        await post_message(client, base, course_id, jwt, conversation, content)
