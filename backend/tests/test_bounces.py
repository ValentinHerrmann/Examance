"""Bounce monitoring (issue #221): parsing delivery reports and routing each message of the bounce mailbox."""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.exam import Exam
from app.models.result_delivery import ResultDelivery
from app.services import account_mail, bounces, result_deliveries

from .factors import sign_in

TOKEN = "a" * 32


def _dsn(token: str = TOKEN, action: str = "failed", status: str = "5.1.1") -> bytes:
    return f"""From: MAILER-DAEMON@mx.example
To: bounces@example.com
Subject: Undelivered Mail Returned to Sender
Message-ID: <abc@mx.example>
MIME-Version: 1.0
Content-Type: multipart/report; report-type=delivery-status; boundary="B"

--B
Content-Type: text/plain

Your mail could not be delivered.
--B
Content-Type: message/delivery-status

Reporting-MTA: dns; mx.example

Final-Recipient: rfc822; student@example.org
Action: {action}
Status: {status}

--B
Content-Type: text/rfc822-headers

Message-ID: <examance-r.{token}@example.com>
Subject: Deine korrigierte Pruefung
--B--
""".encode()


def test_standard_report_is_parsed() -> None:
    assert bounces.parse_bounce(_dsn()) == bounces.Bounce(TOKEN, "failed", "5.1.1")


def test_delayed_report_is_parsed() -> None:
    parsed = bounces.parse_bounce(_dsn(action="delayed", status="4.4.7"))
    assert parsed == bounces.Bounce(TOKEN, "delayed", "4.4.7")


def test_non_standard_bounce_is_matched_by_message_id() -> None:
    raw = f"Subject: failure\n\n550 5.2.2 mailbox full\nMessage-ID: <examance-r.{TOKEN}@x>\n"
    assert bounces.parse_bounce(raw.encode()) == bounces.Bounce(TOKEN, "failed", "5.2.2")


def test_unrelated_mail_is_not_a_bounce() -> None:
    assert bounces.parse_bounce(b"Subject: hello\n\nJust a reply.") is None
    assert bounces.parse_bounce(_dsn(action="delivered", status="2.0.0")) is None


def test_own_forward_is_recognised() -> None:
    assert bounces.is_own_forward(b"X-Examance-Forwarded: bounce\nSubject: x\n\n")
    assert not bounces.is_own_forward(_dsn())


async def _delivery(
    client: AsyncClient, db: AsyncSession, email: str, *, window_open: bool
) -> ResultDelivery:
    teacher = await sign_in(client, db, email)
    exam = Exam(
        id=uuid.uuid4(),
        teacher_id=teacher.id,
        title="Bounce exam",
        retention_until=date.today() + timedelta(days=30),
    )
    db.add(exam)
    await db.flush()
    token = uuid.uuid4().hex
    await result_deliveries.record(
        db, teacher.id, exam.id, "d" * 64, "email", "sent", mail_token=token
    )
    row = await result_deliveries.by_token(db, token)
    assert row is not None
    if not window_open:
        row.watch_until = datetime.now(UTC) - timedelta(seconds=1)
    await db.commit()
    return row


@pytest.fixture
def mailbox(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """A fake bounce mailbox: `inbox` holds the raw messages, `deleted` and `sent` record the outcome."""
    state: dict[str, Any] = {"inbox": [], "deleted": [], "sent": [], "send_ok": True}
    monkeypatch.setattr(settings, "SMTP_BOUNCE_ADDRESS", "bounces@example.com")
    monkeypatch.setattr(settings, "BOUNCE_IMAP_HOST", "imap.example.com")
    monkeypatch.setattr(settings, "BOUNCE_IMAP_USERNAME", "bounces@example.com")
    monkeypatch.setattr(settings, "BOUNCE_IMAP_PASSWORD", "secret")
    monkeypatch.setattr(
        bounces,
        "_fetch_unseen",
        lambda: (None, [(str(i), raw) for i, raw in enumerate(state["inbox"])]),
    )
    monkeypatch.setattr(bounces, "_finish", lambda _imap, done: state["deleted"].extend(done))

    async def fake_send(mail: account_mail.Mail) -> bool:
        state["sent"].append(mail)
        return bool(state["send_ok"])

    monkeypatch.setattr(account_mail, "send", fake_send)
    return state


@pytest.mark.asyncio
async def test_bounce_in_window_only_updates_status(
    client: AsyncClient, db: AsyncSession, mailbox: dict[str, Any]
) -> None:
    row = await _delivery(client, db, "bounce-open@example.com", window_open=True)
    mailbox["inbox"] = [_dsn(row.mail_token or "")]
    assert await bounces.poll_bounces(db)
    await db.refresh(row)
    assert (row.status, row.detail) == ("bounced", "5.1.1")
    assert mailbox["sent"] == []
    assert mailbox["deleted"] == ["0"]


@pytest.mark.asyncio
async def test_late_bounce_is_forwarded_to_the_teacher(
    client: AsyncClient, db: AsyncSession, mailbox: dict[str, Any]
) -> None:
    row = await _delivery(client, db, "bounce-late@example.com", window_open=False)
    mailbox["inbox"] = [_dsn(row.mail_token or "")]
    assert await bounces.poll_bounces(db)
    await db.refresh(row)
    assert row.status == "bounced"
    assert [m.to for m in mailbox["sent"]] == ["bounce-late@example.com"]
    assert mailbox["sent"][0].envelope.attachment == mailbox["inbox"][0]
    assert mailbox["deleted"] == ["0"]


@pytest.mark.asyncio
async def test_unmatched_mail_goes_to_the_sender_address(db: AsyncSession, mailbox: dict[str, Any]) -> None:
    mailbox["inbox"] = [b"Subject: reply\n\nThanks!", _dsn(uuid.uuid4().hex)]
    assert await bounces.poll_bounces(db)
    assert [m.to for m in mailbox["sent"]] == [settings.SMTP_FROM_EMAIL] * 2
    assert mailbox["deleted"] == ["0", "1"]


@pytest.mark.asyncio
async def test_own_forward_is_dropped(db: AsyncSession, mailbox: dict[str, Any]) -> None:
    mailbox["inbox"] = [b"X-Examance-Forwarded: bounce\nSubject: x\n\nloop"]
    assert await bounces.poll_bounces(db)
    assert mailbox["sent"] == []
    assert mailbox["deleted"] == ["0"]


@pytest.mark.asyncio
async def test_failed_forward_stays_for_retry(db: AsyncSession, mailbox: dict[str, Any]) -> None:
    mailbox["send_ok"] = False
    mailbox["inbox"] = [b"Subject: reply\n\nThanks!"]
    assert await bounces.poll_bounces(db)
    assert mailbox["deleted"] == []


@pytest.mark.asyncio
async def test_without_a_bounce_mailbox_nothing_is_read(db: AsyncSession) -> None:
    assert settings.BOUNCE_IMAP_HOST is None
    assert not await bounces.poll_bounces(db)
