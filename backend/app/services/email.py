"""Email transport service using stdlib smtplib with dev-mode logging fallback."""
from __future__ import annotations

import asyncio
import logging
import smtplib
from dataclasses import dataclass
from email import message_from_bytes
from email.message import EmailMessage
from email.policy import default
from email.utils import formatdate, make_msgid

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Sender:
    """A mailbox that sends under its own address and login, so its bounces return to it (the result mailbox, issue #221)."""

    address: str
    host: str
    username: str
    password: str


def result_sender() -> Sender | None:
    """The result mailbox, or None unless it is fully configured (address, password, IMAP host and an SMTP host)."""
    host = settings.RESULT_MAIL_SMTP_HOST or settings.SMTP_HOST
    address, password = settings.RESULT_MAIL_ADDRESS, settings.RESULT_MAIL_PASSWORD
    if not (address and password and settings.RESULT_MAIL_IMAP_HOST and host):
        return None
    return Sender(address, host, settings.RESULT_MAIL_USERNAME or address, password)


@dataclass(frozen=True)
class Envelope:
    """Optional transport details (issue #221): our own Message-ID, another sending mailbox, an attached original mail and extra headers."""

    message_id: str | None = None
    sender: Sender | None = None
    attachment: bytes | None = None
    headers: tuple[tuple[str, str], ...] = ()


def _build_message(
    to_email: str, subject: str, body_text: str, body_html: str | None, env: Envelope
) -> EmailMessage:
    msg = EmailMessage()
    msg["Subject"] = subject
    from_email = env.sender.address if env.sender else settings.SMTP_FROM_EMAIL
    msg["From"] = from_email
    msg["To"] = to_email
    msg["Date"] = formatdate(localtime=True)
    domain = from_email.split("@")[-1] if "@" in from_email else None
    msg["Message-ID"] = env.message_id or make_msgid(domain=domain)
    for name, value in env.headers:
        msg[name] = value
    msg.set_content(body_text)
    if body_html:
        msg.add_alternative(body_html, subtype="html")
    if env.attachment is not None:
        # Attached unchanged as message/rfc822, so the reader sees the original bounce with its headers.
        msg.add_attachment(
            message_from_bytes(env.attachment, policy=default), filename="original.eml"
        )
    return msg


def _login(server: smtplib.SMTP, sender: Sender | None) -> None:
    """Log in as *sender* (the result mailbox), else as the account-mail account if it has credentials."""
    if sender:
        server.login(sender.username, sender.password)
    elif settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)


def _send_sync(
    to_email: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
    envelope: Envelope | None = None,
) -> bool:
    """Synchronous SMTP email delivery."""
    env = envelope or Envelope()
    smtp_host = env.sender.host if env.sender else settings.SMTP_HOST
    if not smtp_host:
        # send_email() already guards this; repeating it here keeps the helper safe on its own and stops smtplib from silently falling back to localhost when no relay is configured.
        logger.error("SMTP_HOST is not configured; cannot send email to %s", to_email)
        return False

    try:
        msg = _build_message(to_email, subject, body_text, body_html, env)
        with smtplib.SMTP(smtp_host, settings.SMTP_PORT, timeout=10) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            _login(server, env.sender)
            # The envelope sender follows From, so bounces return to the mailbox that sent the mail.
            server.send_message(msg)
        # No recipient address in logs (personal data the privacy statement does not list there).
        logger.info("Sent email with subject: %s", subject)
        return True
    except Exception as exc:
        # Never log the body (it carries live tokens) or the address; a refused recipient's error text contains the address, so only its class is logged.
        reason = (
            type(exc).__name__ if isinstance(exc, smtplib.SMTPRecipientsRefused) else repr(exc)
        )
        logger.error("Failed to send email with subject '%s': %s", subject, reason)
        return False


async def send_email(
    to_email: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
    envelope: Envelope | None = None,
) -> bool:
    """Send an email via SMTP or log it in dev mode if SMTP_HOST is not configured."""
    if not (envelope and envelope.sender) and not settings.SMTP_HOST:
        if settings.is_dev:
            logger.info(
                "[DEV MODE EMAIL] To: %s | Subject: %s\nBody:\n%s",
                to_email,
                subject,
                body_text,
            )
            return True
        logger.error(
            "SMTP_HOST is not configured in environment '%s'; cannot send email to %s",
            settings.ENVIRONMENT,
            to_email,
        )
        return False

    return await asyncio.to_thread(_send_sync, to_email, subject, body_text, body_html, envelope)
