"""Account mails: set-password (reset / invite), registration, approval notices.

Rendering only; delivery is `app.services.email.send_email`. Every interpolated value is
HTML-escaped in the HTML part, and nothing a registrant typed (the note) is ever put in a mail.
"""
from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass
from html import escape
from typing import Literal

from app.config import settings
from app.services import email as email_svc

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Mail:
    to: str
    subject: str
    text: str
    html: str


def frontend_link(path: str) -> str:
    """Absolute link into the frontend (`FRONTEND_URL` + *path*)."""
    return f"{settings.FRONTEND_URL.rstrip('/')}{path}"


def _compose(
    to: str,
    subject: str,
    paragraphs: Sequence[str],
    *,
    link: tuple[str, str] | None = None,
    footer: Sequence[str] = (),
) -> Mail:
    text_parts = ["Hello,", *paragraphs]
    html_parts = ["<p>Hello,</p>", *(f"<p>{escape(p)}</p>" for p in paragraphs)]
    if link is not None:
        label, url = link
        text_parts.append(f"{label}:\n{url}")
        html_parts.append(f'<p><a href="{escape(url, quote=True)}">{escape(label)}</a></p>')
    text_parts.extend(footer)
    html_parts.extend(f"<p>{escape(p)}</p>" for p in footer)
    return Mail(to=to, subject=subject, text="\n\n".join(text_parts), html="".join(html_parts))


def set_password_mail(email: str, link: str, kind: Literal["reset", "invite"]) -> Mail:
    """The mailed `/reset-password` link: a reset, or the invitation of a new account."""
    expiry = f"This link expires in {settings.PASSWORD_RESET_TOKEN_TTL_HOURS} hours."
    if kind == "invite":
        return _compose(
            email,
            "You have been invited to Examance",
            [
                f"An administrator created an Examance account for {email}.",
                "Choose your password to get started. On your first sign-in you will also set "
                "up a second sign-in factor.",
            ],
            link=("Set your password", link),
            footer=[expiry, "If you did not expect this invitation, you can ignore this email."],
        )
    return _compose(
        email,
        "Reset your Examance password",
        [f"A password set or reset link was generated for your account ({email})."],
        link=("Set your password", link),
        footer=[expiry, "If you did not request this, you can ignore this email."],
    )


def verification_mail(email: str, link: str) -> Mail:
    """Confirms a self-registration; the link leads to the page that sets the password."""
    return _compose(
        email,
        "Confirm your Examance registration",
        [
            f"Someone, hopefully you, asked to create an Examance account for {email}.",
            "Open the link to confirm your address and choose a password.",
        ],
        link=("Confirm your address", link),
        footer=[
            f"This link expires in {settings.REGISTRATION_TOKEN_TTL_HOURS} hours.",
            "If this was not you, ignore this email: no account is created without the link.",
        ],
    )


def admin_notice_mail(admin_email: str, pending: int) -> Mail:
    """Tells an admin that registrations wait for approval. Carries no registrant data."""
    return _compose(
        admin_email,
        "Examance: registrations awaiting approval",
        [f"{pending} account(s) awaiting your approval."],
        link=("Review registrations", frontend_link("/admin/users")),
    )


def approved_mail(email: str) -> Mail:
    return _compose(
        email,
        "Your Examance account was approved",
        [
            f"An administrator approved your Examance account ({email}).",
            "Sign in with the password you chose. On your first sign-in you will set up a "
            "second sign-in factor.",
        ],
        link=("Sign in", frontend_link("/unlock")),
    )


def rejected_mail(email: str) -> Mail:
    return _compose(
        email,
        "Your Examance registration",
        [
            f"Your request for an Examance account ({email}) was not approved, and the "
            "registration has been deleted.",
            "If you think this is a mistake, contact the administrator of your Examance "
            "installation.",
        ],
    )


async def send(mail: Mail) -> bool:
    """Deliver *mail*; never raises."""
    try:
        return await email_svc.send_email(
            to_email=mail.to, subject=mail.subject, body_text=mail.text, body_html=mail.html
        )
    except Exception:
        logger.exception("Sending '%s' failed", mail.subject)
        return False


async def send_all(mails: Sequence[Mail]) -> None:
    """Deliver *mails* one by one. For `BackgroundTasks`: plain data in, nothing out."""
    for mail in mails:
        await send(mail)
