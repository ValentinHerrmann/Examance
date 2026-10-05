"""Password reset token and delivery services."""
from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Literal

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.password_reset_token import PasswordResetToken
from app.models.refresh_token import RefreshToken
from app.models.teacher import Teacher
from app.services import account_mail
from app.services.account_mail import Mail
from app.services.crypto import hash_password
from app.services.key_envelope import invalidate_password_wrap


def hash_reset_token(raw_token: str) -> str:
    """Compute SHA-256 hash of raw reset token."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


async def create_reset_token(db: AsyncSession, teacher: Teacher) -> tuple[str, Mail]:
    """
    Generate a single-use password reset token, persist its hash and invalidate prior unused
    tokens for this teacher. Returns the raw token and the mail carrying it, unsent.

    An account without a password gets the invitation wording: it was created by an admin and
    has never signed in.
    """
    raw_token = secrets.token_urlsafe(32)
    token_hash = hash_reset_token(raw_token)
    expires_at = datetime.now(UTC) + timedelta(hours=settings.PASSWORD_RESET_TOKEN_TTL_HOURS)

    # Invalidate prior unused reset tokens for this teacher
    await db.execute(
        delete(PasswordResetToken).where(
            PasswordResetToken.teacher_id == teacher.id,
            PasswordResetToken.used_at.is_(None),
        )
    )

    reset_token_record = PasswordResetToken(
        teacher_id=teacher.id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(reset_token_record)
    await db.flush()

    link = account_mail.frontend_link(f"/reset-password?token={raw_token}")
    kind: Literal["reset", "invite"] = "invite" if teacher.password_hash is None else "reset"
    return raw_token, account_mail.set_password_mail(teacher.email, link, kind)


async def create_and_send_reset_token(
    db: AsyncSession, teacher: Teacher
) -> tuple[str, bool]:
    """
    `create_reset_token`, then send the mail right away.

    Returns a tuple of (raw_token, email_sent_successfully). For callers that report delivery
    (the admin endpoints); public endpoints send from a background task instead, so their
    response time does not reveal whether an account exists.
    """
    raw_token, mail = await create_reset_token(db, teacher)
    return raw_token, await account_mail.send(mail)


async def verify_reset_token(
    db: AsyncSession, raw_token: str
) -> tuple[PasswordResetToken | None, Teacher | None]:
    """Verify raw token matches an unused, unexpired reset token record."""
    token_hash = hash_reset_token(raw_token)
    stmt = (
        select(PasswordResetToken, Teacher)
        .join(Teacher, PasswordResetToken.teacher_id == Teacher.id)
        .where(PasswordResetToken.token_hash == token_hash)
    )
    result = await db.execute(stmt)
    row = result.first()
    if not row:
        return None, None

    token_record, teacher = row
    now = datetime.now(UTC)
    expires_at = token_record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)

    if token_record.used_at is not None or expires_at <= now:
        return None, None

    # A pending account holds no token of any kind, a reset included. Covers /auth/reset/start
    # and /auth/reset-password alike.
    if teacher.approved_at is None:
        return None, None

    return token_record, teacher


async def complete_password_reset(
    db: AsyncSession, raw_token: str, new_password: str
) -> Teacher:
    """
    Validate token, set new teacher password, mark token used, and revoke all active refresh tokens.
    """
    token_record, teacher = await verify_reset_token(db, raw_token)
    if not token_record or not teacher:
        raise ValueError("Invalid or expired password reset token.")

    token_record.used_at = datetime.now(UTC)
    teacher.password_hash = hash_password(new_password)
    teacher.password_changed_at = datetime.now(UTC)

    # The new password cannot open the old wrap, and the server has no way to
    # re-wrap: it never sees the data key. Marking the wrap stale is what makes
    # the client offer the recovery code instead of silently showing a vault of
    # blank fields. The recovery and passkey wraps still hold the same key.
    await invalidate_password_wrap(db, teacher.id)

    # Force re-authentication across all active sessions by revoking refresh tokens
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.teacher_id == teacher.id)
        .values(revoked=True)
    )

    return teacher
