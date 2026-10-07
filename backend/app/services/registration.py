"""Self-registration (issue #53): `request_registration` stores a hashed single-use token and mails
it; only `complete_registration` creates the account, approved at once just for allowlisted domains.
Neither step may reveal whether an address already has an account."""
from __future__ import annotations

import re
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.allowed_email_domain import AllowedEmailDomain
from app.models.registration_request import RegistrationRequest
from app.models.teacher import Teacher
from app.services import account_mail
from app.services.account_mail import Mail
from app.services.crypto import hash_password
from app.services.tokens import aware, hash_token, rowcount

# A quiet period between admin notices: a burst of registrations produces one mail.
ADMIN_NOTICE_QUIET_MINUTES = 15

# Hostname labels: letters, digits, hyphens; at least two labels; no wildcards.
_DOMAIN_RE = re.compile(
    r"^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$"
)


class RegistrationTokenError(Exception):
    """The verification link is unknown, used or expired."""


def normalize_email(raw: str) -> str:
    return raw.strip().lower()


def email_domain(email: str) -> str:
    return email.rsplit("@", 1)[-1].lower()


def normalize_domain(raw: str) -> str:
    """Lowercase *raw*, drop a leading '@'; raise ValueError unless it is a plain hostname."""
    domain = raw.strip().lower().removeprefix("@")
    if not _DOMAIN_RE.fullmatch(domain):
        raise ValueError("Not a valid domain.")
    return domain


async def domain_rule(db: AsyncSession, email: str) -> AllowedEmailDomain | None:
    """The always-allowed entry for *email*'s domain, if any."""
    result = await db.execute(
        select(AllowedEmailDomain).where(AllowedEmailDomain.domain == email_domain(email))
    )
    return result.scalar_one_or_none()


async def request_registration(db: AsyncSession, email: str) -> Mail | None:
    """Create or refresh the registration request for *email* and return its verification mail.

    None (nothing sent) if the address has an account or a mail went out within the cooldown. The
    caller commits, then sends; a unique-email failure on commit is a race: treat it as cooldown."""
    existing_account = await db.scalar(
        select(Teacher.id).where(func.lower(Teacher.email) == email)
    )
    if existing_account is not None:
        return None

    now = datetime.now(UTC)
    request = await db.scalar(
        select(RegistrationRequest).where(RegistrationRequest.email == email)
    )
    cooldown = timedelta(seconds=settings.REGISTRATION_RESEND_COOLDOWN_SECONDS)
    if request is not None and aware(request.last_sent_at) + cooldown > now:
        return None

    raw_token = secrets.token_urlsafe(32)
    expires_at = now + timedelta(hours=settings.REGISTRATION_TOKEN_TTL_HOURS)
    if request is None:
        db.add(
            RegistrationRequest(
                email=email,
                token_hash=hash_token(raw_token),
                expires_at=expires_at,
                last_sent_at=now,
            )
        )
    else:
        # A fresh token replaces the old one, so only the newest link works.
        request.token_hash = hash_token(raw_token)
        request.expires_at = expires_at
        request.last_sent_at = now

    link = account_mail.frontend_link(f"/verify-email?token={raw_token}")
    return account_mail.verification_mail(email, link)


async def complete_registration(
    db: AsyncSession, raw_token: str, password: str, note: str | None
) -> Teacher:
    """Claim the token and create the account; raises `RegistrationTokenError`.

    Claiming deletes the token row and checks this call deleted it, so concurrent completions cannot
    both create an account. The caller commits; a unique-email violation then is the same error."""
    request = await db.scalar(
        select(RegistrationRequest).where(RegistrationRequest.token_hash == hash_token(raw_token))
    )
    now = datetime.now(UTC)
    if request is None or aware(request.expires_at) <= now:
        raise RegistrationTokenError

    claimed = await db.execute(
        delete(RegistrationRequest).where(RegistrationRequest.id == request.id)
    )
    if rowcount(claimed) != 1:
        raise RegistrationTokenError

    email = request.email
    if await db.scalar(select(Teacher.id).where(func.lower(Teacher.email) == email)) is not None:
        raise RegistrationTokenError

    teacher = Teacher(
        email=email,
        password_hash=hash_password(password),
        password_changed_at=now,
        role="teacher",
    )
    rule = await domain_rule(db, email)
    if rule is not None:
        teacher.approved_at = now
        teacher.allow_server_results = rule.allow_server_results
        teacher.allow_server_latex = rule.allow_server_latex
        teacher.allow_exercise_sharing = rule.allow_exercise_sharing
    else:
        teacher.approved_at = None
        cleaned = (note or "").strip()
        teacher.registration_note = cleaned[:500] or None
    db.add(teacher)
    await db.flush()
    return teacher


async def admin_notices(db: AsyncSession, new_account: Teacher) -> list[Mail]:
    """
    Mails telling every approved admin that registrations are waiting.

    Throttled without extra state: nothing goes out when another pending account arrived during
    the quiet period, since its notice already covers this one.
    """
    since = datetime.now(UTC) - timedelta(minutes=ADMIN_NOTICE_QUIET_MINUTES)
    recent_others = await db.scalar(
        select(func.count())
        .select_from(Teacher)
        .where(
            Teacher.approved_at.is_(None),
            Teacher.id != new_account.id,
            Teacher.created_at >= since,
        )
    )
    if recent_others:
        return []
    pending = (
        await db.scalar(
            select(func.count()).select_from(Teacher).where(Teacher.approved_at.is_(None))
        )
    ) or 0
    admins = await db.scalars(
        select(Teacher.email).where(Teacher.role == "admin", Teacher.approved_at.isnot(None))
    )
    return [account_mail.admin_notice_mail(address, pending) for address in admins]
