"""Bounce monitoring for result mails (issue #221, docs/dev/result_sharing.md). Reads only the dedicated result mailbox (the one result mails are sent from), matches each report to a result mail by the token in its Message-ID, then empties the mailbox. Never logs an address or a message body."""
from __future__ import annotations

import asyncio
import imaplib
import logging
import re
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime
from email import message_from_bytes
from email.message import Message
from email.policy import compat32
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.teacher import Teacher
from app.services import account_mail, ephemeral_store, result_deliveries
from app.services import email as email_svc
from app.services.capabilities import result_mailbox_configured

logger = logging.getLogger(__name__)

RESULT_ID_PREFIX = "examance-r."
FORWARD_ID_PREFIX = "examance-fwd."
_TOKEN = re.compile(rf"<{re.escape(RESULT_ID_PREFIX)}([0-9a-f]{{32}})@", re.IGNORECASE)
_FORWARD = re.compile(rf"<{re.escape(FORWARD_ID_PREFIX)}", re.IGNORECASE)
_STATUS = re.compile(r"\b([245]\.\d{1,3}\.\d{1,3})\b")
_LOCK = "bounces:poll"
_LOCK_SECONDS = 120


def result_message_id(token: str) -> str:
    domain = settings.SMTP_FROM_EMAIL.split("@")[-1]
    return f"<{RESULT_ID_PREFIX}{token}@{domain}>"


def forward_message_id() -> str:
    domain = settings.SMTP_FROM_EMAIL.split("@")[-1]
    return f"<{FORWARD_ID_PREFIX}{secrets.token_hex(16)}@{domain}>"


@dataclass(frozen=True)
class Bounce:
    token: str
    action: Literal["failed", "delayed"]
    status: str | None


def _delivery_status(msg: Message) -> tuple[str | None, str | None]:
    """Action and Status of the first recipient block of an RFC 3464 report, if there is one."""
    for part in msg.walk():
        if part.get_content_type() != "message/delivery-status":
            continue
        payload = part.get_payload()
        blocks = payload if isinstance(payload, list) else []
        for block in blocks:
            if isinstance(block, Message) and block.get("Action"):
                return str(block["Action"]).strip().lower(), block.get("Status")
        # Some servers send the fields as plain text instead of header blocks.
        text = part.as_string()
        action = re.search(r"^Action:\s*(\w+)", text, re.IGNORECASE | re.MULTILINE)
        found = re.search(r"^Status:\s*([245]\.\d+\.\d+)", text, re.IGNORECASE | re.MULTILINE)
        return (action.group(1).lower() if action else None), (found.group(1) if found else None)
    return None, None


def parse_bounce(raw: bytes) -> Bounce | None:
    """The result mail a bounce report refers to, and whether it failed or is delayed; None if it quotes none of our result mails."""
    msg = message_from_bytes(raw, policy=compat32)
    text = raw.decode("utf-8", errors="replace")
    match = _TOKEN.search(text)
    if match is None:
        return None
    action, status = _delivery_status(msg)
    if action is None:
        # Non-standard bounce: no report part, so judge by the first enhanced status code.
        code = _STATUS.search(text)
        status = code.group(1) if code else None
        action = "delayed" if status and status.startswith("4.") else "failed"
    if action not in ("failed", "delayed"):
        # "delivered", "relayed" or "expanded" reports are not problems.
        return None
    return Bounce(token=match.group(1).lower(), action=action, status=status)  # type: ignore[arg-type]


def is_own_forward(raw: bytes) -> bool:
    """A forward of ours that bounced back: dropping it prevents a mail loop."""
    msg = message_from_bytes(raw, policy=compat32)
    if msg.get("X-Examance-Forwarded"):
        return True
    return bool(_FORWARD.search(raw.decode("utf-8", errors="replace")))


@dataclass
class _Counts:
    matched: int = 0
    forwarded_teacher: int = 0
    forwarded_admin: int = 0
    dropped: int = 0
    kept: int = 0


async def _handle(db: AsyncSession, raw: bytes, counts: _Counts) -> bool:
    """Handle one message; True when it may be deleted from the mailbox."""
    if is_own_forward(raw):
        counts.dropped += 1
        return True
    bounce = parse_bounce(raw)
    row = await result_deliveries.by_token(db, bounce.token) if bounce else None
    if bounce is None or row is None:
        if await account_mail.send(
            account_mail.bounce_forward_mail(
                settings.SMTP_FROM_EMAIL, None, raw, forward_message_id()
            )
        ):
            counts.forwarded_admin += 1
            return True
        counts.kept += 1
        return False
    result_deliveries.apply_bounce(row, bounce.action, bounce.status)
    counts.matched += 1
    if row.watch_until > datetime.now(UTC) or bounce.action == "delayed":
        # The open dialog shows it; a mere delay is not worth a mail.
        return True
    teacher = await db.get(Teacher, row.teacher_id)
    if teacher is None:
        return True
    link = account_mail.frontend_link(f"/exam/{row.exam_id}")
    if await account_mail.send(
        account_mail.bounce_forward_mail(teacher.email, link, raw, forward_message_id())
    ):
        counts.forwarded_teacher += 1
        return True
    counts.kept += 1
    return False


def _fetch_unseen() -> tuple[imaplib.IMAP4_SSL, list[tuple[str, bytes]]]:
    sender = email_svc.result_sender()
    if sender is None:
        raise imaplib.IMAP4.error("result mailbox not configured")
    imap = imaplib.IMAP4_SSL(
        settings.RESULT_MAIL_IMAP_HOST or "", settings.RESULT_MAIL_IMAP_PORT, timeout=20
    )
    imap.login(sender.username, sender.password)
    imap.select(settings.RESULT_MAIL_IMAP_FOLDER)
    _, data = imap.uid("SEARCH", "UNSEEN")
    messages: list[tuple[str, bytes]] = []
    for uid in bytes(data[0] or b"").decode().split():
        # BODY.PEEK leaves the message unseen until it is handled, so a failed run retries it.
        _, parts = imap.uid("FETCH", uid, "(BODY.PEEK[])")
        raw = next((p[1] for p in parts if isinstance(p, tuple) and len(p) > 1), None)
        if isinstance(raw, bytes):
            messages.append((uid, raw))
    return imap, messages


def _finish(imap: imaplib.IMAP4_SSL, done: list[str]) -> None:
    try:
        for uid in done:
            # The mailbox holds students' addresses: handled messages leave it for good.
            imap.uid("STORE", uid, "+FLAGS", "(\\Seen \\Deleted)")
        if done:
            imap.expunge()
        imap.close()
    finally:
        imap.logout()


async def poll_bounces(db: AsyncSession) -> bool:
    """Read the result mailbox once and commit the status changes; False when not configured or another poll is running."""
    if not result_mailbox_configured():
        return False
    # One reader at a time across dialogs and the cron; the TTL frees a lock a crashed poll left behind.
    if await ephemeral_store.incr(_LOCK, _LOCK_SECONDS) != 1:
        return False
    counts = _Counts()
    try:
        try:
            imap, messages = await asyncio.to_thread(_fetch_unseen)
        except (OSError, imaplib.IMAP4.error) as exc:
            logger.error("Result mailbox unreachable: %s", type(exc).__name__)
            return False
        done: list[str] = []
        try:
            for uid, raw in messages:
                if await _handle(db, raw, counts):
                    done.append(uid)
            await db.commit()
        except BaseException:
            # Nothing was recorded, so nothing may leave the mailbox: the next poll retries.
            done = []
            raise
        finally:
            await asyncio.to_thread(_finish, imap, done)
        if messages:
            logger.info(
                "Result mailbox: %d matched, %d forwarded to teachers, %d to the sender, "
                "%d own forwards dropped, %d kept for retry",
                counts.matched,
                counts.forwarded_teacher,
                counts.forwarded_admin,
                counts.dropped,
                counts.kept,
            )
        return True
    finally:
        await ephemeral_store.delete(_LOCK)
