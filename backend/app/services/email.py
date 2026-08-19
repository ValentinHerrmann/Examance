"""Email transport service using stdlib smtplib with dev-mode logging fallback."""
from __future__ import annotations

import asyncio
import logging
import smtplib
from email.message import EmailMessage
from email.utils import formatdate, make_msgid

from app.config import settings

logger = logging.getLogger(__name__)


def _send_sync(
    to_email: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
) -> bool:
    """Synchronous SMTP email delivery."""
    smtp_host = settings.SMTP_HOST
    if not smtp_host:
        # send_email() already guards this; repeating it here keeps the helper
        # safe on its own and stops smtplib from silently falling back to
        # localhost when no relay is configured.
        logger.error("SMTP_HOST is not configured; cannot send email to %s", to_email)
        return False

    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_FROM_EMAIL
        msg["To"] = to_email
        msg["Date"] = formatdate(localtime=True)

        from_email = settings.SMTP_FROM_EMAIL
        domain = from_email.split("@")[-1] if "@" in from_email else None
        msg["Message-ID"] = make_msgid(domain=domain)

        msg.set_content(body_text)
        if body_html:
            msg.add_alternative(body_html, subtype="html")

        with smtplib.SMTP(smtp_host, settings.SMTP_PORT, timeout=10) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.send_message(msg)
        logger.info("Sent email to %s with subject: %s", to_email, subject)
        return True
    except Exception as exc:
        # Never log the message body: it carries the live password-reset token.
        logger.error(
            "Failed to send email to %s with subject '%s': %s",
            to_email,
            subject,
            exc,
            exc_info=True,
        )
        return False


async def send_email(
    to_email: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
) -> bool:
    """
    Send an email via SMTP or log it in dev mode if SMTP_HOST is not configured.
    """
    if not settings.SMTP_HOST:
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

    return await asyncio.to_thread(_send_sync, to_email, subject, body_text, body_html)
