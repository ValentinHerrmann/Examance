"""Result delivery (issue #209): the feature gate, the Artemis relay and the result-link mail."""

from __future__ import annotations

import asyncio
import logging
import ssl
import uuid
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta

import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.result_delivery import ResultDelivery
from app.models.teacher import Teacher
from app.services import account_mail, artemis

from .factors import sign_in

API = "/api/v1/integrations"
JWT = "eyJ-secret-artemis-token"  # noqa: S105 - test fixture credential
HOST = "artemis.tum.de"
COURSE = {"host": HOST, "course_id": 7, "jwt": JWT}
RESULT_URL = "http://localhost:5173/result#abc"
Handler = Callable[[httpx.Request], httpx.Response]


async def _teacher(client: AsyncClient, db: AsyncSession, email: str, *, on: bool = True) -> None:
    teacher = await sign_in(client, db, email)
    await db.execute(
        update(Teacher).where(Teacher.id == teacher.id).values(allow_result_delivery=on)
    )
    await db.commit()


def _mock_artemis(monkeypatch: pytest.MonkeyPatch, handler: Handler) -> None:
    monkeypatch.setattr(
        artemis,
        "_client",
        lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler), follow_redirects=False),
    )


STUDENT = "b" * 64


async def _exam(client: AsyncClient) -> str:
    resp = await client.post(
        "/api/v1/exams",
        json={"title": "Analysis I", "retention_until": (date.today() + timedelta(days=30)).isoformat()},
    )
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])


def _mail_body(url: str = RESULT_URL, exam_id: str | None = None) -> dict[str, object]:
    expires = (datetime.now(UTC) + timedelta(days=30)).isoformat()
    return {
        "exam_id": exam_id or str(uuid.uuid4()),
        "exam_title": "Analysis I",
        "locale": "de",
        "recipients": [
            {"email": "student@example.com", "student_key": STUDENT, "url": url, "expires_at": expires}
        ],
    }


@pytest.mark.asyncio
async def test_switch_off_is_forbidden_everywhere(client: AsyncClient, db: AsyncSession) -> None:
    await _teacher(client, db, "off@example.com", on=False)
    for path, body in (("/artemis/students", COURSE), ("/mail/results", _mail_body())):
        resp = await client.post(API + path, json=body)
        assert resp.status_code == 403
        assert resp.headers["code"] == "ERR_FEATURE_NOT_ALLOWED"


@pytest.mark.asyncio
async def test_unlisted_host_is_rejected(client: AsyncClient, db: AsyncSession) -> None:
    await _teacher(client, db, "host@example.com")
    for host in ("evil.example.com", "artemis.tum.de@evil.com", "artemis.tum.de/x", ""):
        resp = await client.post(API + "/artemis/students", json={**COURSE, "host": host})
        assert resp.status_code in (400, 422)
        if resp.status_code == 400:
            assert resp.headers["code"] == "ERR_ARTEMIS_HOST_NOT_ALLOWED"


@pytest.mark.asyncio
async def test_students_are_mapped(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _teacher(client, db, "list@example.com")
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(
            200,
            json=[
                {
                    "id": 1,
                    "firstName": "Ada",
                    "lastName": "Lovelace",
                    "login": "ga1",
                    "email": "a@x",
                },
                {"id": 2, "name": "Only Name"},
                {"firstName": "No id"},
            ],
        )

    _mock_artemis(monkeypatch, handler)
    resp = await client.post(API + "/artemis/students", json=COURSE)
    assert resp.status_code == 200, resp.text
    assert resp.json()["students"] == [
        {"id": 1, "name": "Lovelace, Ada", "login": "ga1", "email": "a@x"},
        {"id": 2, "name": "Only Name", "login": None, "email": None},
    ]
    # Current Artemis serves the list from its `course` module; no legacy call is needed.
    assert [str(r.url) for r in seen] == ["https://artemis.tum.de/api/course/courses/7/students"]
    assert seen[0].headers["authorization"] == f"Bearer {JWT}"
    assert seen[0].headers["user-agent"].startswith("Examance")


@pytest.mark.asyncio
async def test_students_fall_back_to_the_legacy_path(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Regression (#209): Artemis moved the endpoint; older instances only know the `core` path."""
    await _teacher(client, db, "legacy@example.com")
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        if request.url.path.startswith("/api/course/"):
            return httpx.Response(404, json={"errorKey": "error.http.404"})
        return httpx.Response(200, json=[{"id": 3, "name": "Old Artemis"}])

    _mock_artemis(monkeypatch, handler)
    resp = await client.post(API + "/artemis/students", json=COURSE)
    assert resp.status_code == 200, resp.text
    assert resp.json()["students"][0]["id"] == 3
    assert seen == ["/api/course/courses/7/students", "/api/core/courses/7/students"]


@pytest.mark.asyncio
async def test_missing_endpoint_names_status_step_and_error_key(
    client: AsyncClient,
    db: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    await _teacher(client, db, "gone@example.com")
    _mock_artemis(
        monkeypatch,
        lambda request: httpx.Response(404, json={"errorKey": "courseNotFound", "detail": JWT}),
    )
    with caplog.at_level(logging.INFO):
        resp = await client.post(API + "/artemis/students", json=COURSE)
    assert resp.status_code == 424
    detail = resp.json()["detail"]
    assert "HTTP 404" in detail
    assert "students" in detail
    assert "courseNotFound" in detail
    assert JWT not in resp.text
    assert JWT not in caplog.text


@pytest.mark.asyncio
async def test_server_error_is_not_retried_on_the_legacy_path(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _teacher(client, db, "busy@example.com")
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url.path)
        return httpx.Response(500, text="stack trace")

    _mock_artemis(monkeypatch, handler)
    resp = await client.post(API + "/artemis/students", json=COURSE)
    assert resp.status_code == 424
    assert "HTTP 500" in resp.json()["detail"]
    assert "stack trace" not in resp.text
    assert seen == ["/api/course/courses/7/students"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("upstream", "status", "code"),
    [
        (401, 400, "ERR_ARTEMIS_AUTH"),
        (403, 400, "ERR_ARTEMIS_AUTH"),
        (302, 400, "ERR_ARTEMIS_AUTH"),
        (500, 424, "ERR_ARTEMIS_UPSTREAM"),
        (404, 424, "ERR_ARTEMIS_UPSTREAM"),
    ],
)
async def test_upstream_errors_never_become_401(
    client: AsyncClient,
    db: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    upstream: int,
    status: int,
    code: str,
) -> None:
    await _teacher(client, db, f"up{upstream}@example.com")
    _mock_artemis(monkeypatch, lambda request: httpx.Response(upstream))
    resp = await client.post(API + "/artemis/students", json=COURSE)
    assert resp.status_code == status
    assert resp.headers["code"] == code
    assert JWT not in resp.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "error", [httpx.ConnectError("dns"), ssl.SSLError("bad cert"), OSError("reset")]
)
async def test_transport_failures_answer_with_our_own_code(
    client: AsyncClient,
    db: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    error: Exception,
) -> None:
    """Regression (#209 on preview): a 5xx from us was swapped by the proxy for a page without CORS headers; failures must be 4xx, coded and logged by step."""
    await _teacher(client, db, f"tr{type(error).__name__}@example.com")

    def handler(request: httpx.Request) -> httpx.Response:
        raise error

    _mock_artemis(monkeypatch, handler)
    with caplog.at_level(logging.INFO):
        resp = await client.post(API + "/artemis/students", json=COURSE)
    assert resp.status_code == 424
    assert resp.headers["code"] == "ERR_ARTEMIS_UPSTREAM"
    assert "students" in caplog.text
    assert HOST in caplog.text
    assert JWT not in caplog.text


@pytest.mark.asyncio
async def test_slow_artemis_ends_within_the_deadline(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _teacher(client, db, "slow@example.com")

    async def handler(request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(5)
        return httpx.Response(200, json=[])

    _mock_artemis(monkeypatch, handler)  # type: ignore[arg-type]
    monkeypatch.setattr(artemis, "DEADLINE_SECONDS", 0.1)
    resp = await client.post(
        API + "/artemis/messages", json={**COURSE, "user_id": 5, "content": "Hi"}
    )
    assert resp.status_code == 424
    assert resp.headers["code"] == "ERR_ARTEMIS_TIMEOUT"


@pytest.mark.asyncio
async def test_message_and_file_flow_without_leaking_the_token(
    client: AsyncClient,
    db: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    await _teacher(client, db, "flow@example.com")
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if request.url.path.endswith("one-to-one-chats"):
            return httpx.Response(200, json={"id": 99})
        if "/files/" in request.url.path:
            return httpx.Response(200, json={"path": "/api/core/files/x.pdf"})
        return httpx.Response(200, json={})

    _mock_artemis(monkeypatch, handler)
    with caplog.at_level(logging.DEBUG):
        sent = await client.post(
            API + "/artemis/messages", json={**COURSE, "user_id": 5, "content": "Hallo"}
        )
        pdf = await client.post(
            API + "/artemis/files",
            data={**{k: str(v) for k, v in COURSE.items()}, "user_id": "5", "message": "Note"},
            files={"file": ("r.pdf", b"%PDF-1.7 body", "application/pdf")},
        )
        bad = await client.post(
            API + "/artemis/files",
            data={**{k: str(v) for k, v in COURSE.items()}, "user_id": "5"},
            files={"file": ("r.pdf", b"not a pdf", "application/pdf")},
        )
    assert sent.json() == {"ok": True}
    assert pdf.status_code == 200, pdf.text
    assert bad.status_code == 400
    assert calls[-1].endswith("/messages")
    assert JWT not in caplog.text


@pytest.mark.asyncio
async def test_mail_rejects_foreign_links(client: AsyncClient, db: AsyncSession) -> None:
    await _teacher(client, db, "link@example.com")
    for url in (
        "https://evil.example.com/result#abc",
        "http://localhost:5173/other#abc",
        "http://localhost:5173/result?x=1#abc",
        "http://localhost:5173/result#a b",
        "http://localhost:5173/result#" + "a" * 600,
    ):
        resp = await client.post(API + "/mail/results", json=_mail_body(url))
        assert resp.status_code == 422, url
        assert resp.headers["code"] == "ERR_RESULT_LINK_INVALID"


@pytest.mark.asyncio
async def test_mail_is_sent_and_failures_are_counted(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _teacher(client, db, "mail@example.com")
    sent: list[account_mail.Mail] = []

    async def fake_send(mail: account_mail.Mail) -> bool:
        sent.append(mail)
        return len(sent) != 2

    monkeypatch.setattr(account_mail, "send", fake_send)
    body = _mail_body(exam_id=await _exam(client))
    recipients = body["recipients"]
    assert isinstance(recipients, list)
    body["recipients"] = [recipients[0], recipients[0]]
    resp = await client.post(API + "/mail/results", json=body)
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"sent": 1, "failed": [1]}
    assert sent[0].subject == "Deine korrigierte Prüfung: Analysis I"
    assert RESULT_URL in sent[0].text


@pytest.mark.asyncio
async def test_review_reply_mail_is_not_a_tracked_delivery(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _teacher(client, db, "reply@example.com")
    sent: list[account_mail.Mail] = []

    async def fake_send(mail: account_mail.Mail) -> bool:
        sent.append(mail)
        return len(sent) == 1

    monkeypatch.setattr(account_mail, "send", fake_send)
    exam_id = await _exam(client)
    body = _mail_body(exam_id=exam_id)
    rows = select(ResultDelivery).where(ResultDelivery.exam_id == uuid.UUID(exam_id))
    body["kind"] = "review_reply"
    ok = await client.post(API + "/mail/results", json=body)
    assert ok.json() == {"sent": 1, "failed": []}
    assert await db.scalar(rows) is None
    failed = await client.post(API + "/mail/results", json=body)
    assert failed.json() == {"sent": 0, "failed": [0]}
    assert await db.scalar(rows) is None
    assert sent[0].envelope is None or sent[0].envelope.message_id is None

    body["kind"] = "result"
    monkeypatch.setattr(account_mail, "send", lambda mail: _true())
    assert (await client.post(API + "/mail/results", json=body)).json()["sent"] == 1
    row = await db.scalar(rows)
    assert row is not None
    before = (row.status, row.mail_token, row.updated_at)
    body["kind"] = "review_reply"
    assert (await client.post(API + "/mail/results", json=body)).json()["sent"] == 1
    await db.refresh(row)
    assert (row.status, row.mail_token, row.updated_at) == before


async def _true() -> bool:
    return True


@pytest.mark.asyncio
async def test_mail_unavailable_in_production_without_smtp(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _teacher(client, db, "nosmtp@example.com")
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "SMTP_HOST", None)
    resp = await client.post(API + "/mail/results", json=_mail_body())
    assert resp.status_code == 503
    assert resp.headers["code"] == "ERR_MAIL_UNAVAILABLE"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("smtp", "on", "expected"),
    [(None, True, False), ("smtp.example.com", True, True), ("smtp.example.com", False, False)],
)
async def test_capabilities_tell_whether_mail_can_be_sent(
    client: AsyncClient,
    db: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    smtp: str | None,
    on: bool,
    expected: bool,
) -> None:
    # The share dialog greys out e-mail with a reason instead of failing on send.
    await _teacher(client, db, f"caps-{smtp}-{on}@example.com", on=on)
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "SMTP_HOST", smtp)
    caps = await client.get("/api/v1/user/capabilities")
    assert caps.json()["features"]["result_mail"] is expected


@pytest.mark.asyncio
async def test_mail_carries_the_code_only_when_asked(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _teacher(client, db, "code@example.com")
    sent: list[account_mail.Mail] = []

    async def fake_send(mail: account_mail.Mail) -> bool:
        sent.append(mail)
        return True

    monkeypatch.setattr(account_mail, "send", fake_send)
    exam_id = await _exam(client)
    plain = _mail_body(exam_id=exam_id)
    assert (await client.post(API + "/mail/results", json=plain)).status_code == 200
    with_code = _mail_body(exam_id=exam_id)
    with_code["recipients"][0]["code"] = "ABCD-2345"  # type: ignore[index]
    assert (await client.post(API + "/mail/results", json=with_code)).status_code == 200
    assert "ABCD-2345" not in sent[0].text
    assert "Schlüssel ein: ABCD-2345" in sent[1].text
    assert sent[1].subject.startswith("Deine korrigierte Prüfung")
    bad = _mail_body()
    bad["recipients"][0]["code"] = "<script>"  # type: ignore[index]
    assert (await client.post(API + "/mail/results", json=bad)).status_code == 422


@pytest.mark.asyncio
async def test_mail_records_each_students_status(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Issue #221: the dialog shows who was not reached, under the pseudonym only.
    await _teacher(client, db, "status@example.com")
    outcomes = iter([True, False])

    async def fake_send(mail: account_mail.Mail) -> bool:
        assert mail.envelope is not None
        assert mail.envelope.message_id is not None
        assert mail.envelope.message_id.startswith("<examance-r.")
        return next(outcomes)

    monkeypatch.setattr(account_mail, "send", fake_send)
    exam_id = await _exam(client)
    body = _mail_body(exam_id=exam_id)
    recipients = body["recipients"]
    assert isinstance(recipients, list)
    body["recipients"] = [recipients[0], {**recipients[0], "student_key": "c" * 64}]
    assert (await client.post(API + "/mail/results", json=body)).status_code == 200
    listed = (await client.get(f"/api/v1/exams/{exam_id}/deliveries")).json()
    assert {(d["student_key"], d["status"]) for d in listed} == {
        (STUDENT, "sent"),
        ("c" * 64, "failed"),
    }
    assert all("@" not in (d["detail"] or "") for d in listed)


@pytest.mark.asyncio
async def test_mail_for_a_foreign_exam_is_refused(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _teacher(client, db, "foreign@example.com")
    monkeypatch.setattr(account_mail, "send", lambda _mail: asyncio.sleep(0, True))
    resp = await client.post(API + "/mail/results", json=_mail_body())
    assert resp.status_code == 404
