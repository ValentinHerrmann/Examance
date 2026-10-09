"""Password reset token and delivery services."""
from __future__ import annotations

import secrets
import uuid
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
from app.services.tokens import aware, hash_token


async def create_reset_token(db: AsyncSession, teacher: Teacher) -> tuple[str, Mail]:
    """Generate a single-use reset token, persist its hash, invalidate prior unused tokens.

    Returns the raw token and the unsent mail carrying it. An account without a password (admin
    created, never signed in) gets the invitation wording."""
    raw_token = secrets.token_urlsafe(32)
    token_hash = hash_token(raw_token)
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
    """`create_reset_token`, then send the mail now; returns (raw_token, email_sent).

    For callers that report delivery (admin endpoints). Public endpoints send from a background
    task instead, so response time does not reveal whether an account exists."""
    raw_token, mail = await create_reset_token(db, teacher)
    return raw_token, await account_mail.send(mail)


async def verify_reset_token(
    db: AsyncSession, raw_token: str
) -> tuple[PasswordResetToken | None, Teacher | None]:
    """Verify raw token matches an unused, unexpired reset token record."""
    token_hash = hash_token(raw_token)
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
    if token_record.used_at is not None or aware(token_record.expires_at) <= now:
        return None, None

    # A pending account holds no token of any kind, a reset included. Covers /auth/reset/start
    # and /auth/reset-password alike.
    if teacher.approved_at is None:
        return None, None

    return token_record, teacher


async def complete_password_reset(
    db: AsyncSession, raw_token: str, new_password: str, *, teacher_id: uuid.UUID
) -> Teacher:
    """
    Validate token, set new teacher password, mark token used, and revoke all active refresh tokens.

    The token must belong to `teacher_id`, the account whose factors the reset session proved.
    """
    token_record, teacher = await verify_reset_token(db, raw_token)
    if not token_record or not teacher or teacher.id != teacher_id:
        raise ValueError("Invalid or expired password reset token.")

    token_record.used_at = datetime.now(UTC)
    teacher.password_hash = hash_password(new_password)
    teacher.password_changed_at = datetime.now(UTC)

    # The server never sees the data key, so it cannot re-wrap it for the new password: a stale wrap
    # makes the client offer the recovery code, not a vault of blank fields. The recovery and
    # passkey wraps still hold the same key.
    await invalidate_password_wrap(db, teacher.id)

    # Force re-authentication across all active sessions by revoking refresh tokens
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.teacher_id == teacher.id)
        .values(revoked=True)
    )

    return teacher
