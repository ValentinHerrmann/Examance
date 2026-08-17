"""Email transport service using stdlib smtplib with dev-mode logging fallback."""
from __future__ import annotations

import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
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
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_FROM_EMAIL
        msg["To"] = to_email
        msg["Date"] = formatdate(localtime=True)

        domain = settings.SMTP_FROM_EMAIL.split("@")[-1] if "@" in settings.SMTP_FROM_EMAIL else None
        msg["Message-ID"] = make_msgid(domain=domain)

        msg.attach(MIMEText(body_text, "plain", "utf-8"))
        if body_html:
            msg.attach(MIMEText(body_html, "html", "utf-8"))

        raw_msg = msg.as_string()
        logger.info(
            "[TEMP SMTP DEBUG] Preparing to send email to %s\n--- HEADERS ---\n%s\n--- RAW MESSAGE ---\n%s\n----------------",
            to_email,
            "\n".join(f"{k}: {v}" for k, v in msg.items()),
            raw_msg,
        )

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.send_message(msg)
        logger.info("Sent email to %s with subject: %s", to_email, subject)
        return True
    except Exception as exc:
        raw_msg_str = raw_msg if "raw_msg" in locals() else "N/A"
        logger.error(
            "Failed to send email to %s: %s\n--- FAILED RAW MESSAGE ---\n%s\n----------------",
            to_email,
            exc,
            raw_msg_str,
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
