"""Password reset token and delivery services."""
from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.password_reset_token import PasswordResetToken
from app.models.refresh_token import RefreshToken
from app.models.teacher import Teacher
from app.services.crypto import hash_password
from app.services import email as email_svc


def hash_reset_token(raw_token: str) -> str:
    """Compute SHA-256 hash of raw reset token."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


async def create_and_send_reset_token(
    db: AsyncSession, teacher: Teacher
) -> tuple[str, bool]:
    """
    Generate a single-use password reset token, persist its hash, invalidate prior
    unused tokens for this teacher, and send a reset email.

    Returns a tuple of (raw_token, email_sent_successfully).
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

    reset_link = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={raw_token}"
    subject = "Reset your Examance password"
    body_text = (
        f"Hello,\n\n"
        f"A password set or reset link was generated for your account ({teacher.email}).\n\n"
        f"Please use the link below to set your password:\n{reset_link}\n\n"
        f"This link expires in {settings.PASSWORD_RESET_TOKEN_TTL_HOURS} hours.\n\n"
        f"If you did not request this, you can ignore this email."
    )
    body_html = (
        f"<p>Hello,</p>"
        f"<p>A password set or reset link was generated for your account (<strong>{teacher.email}</strong>).</p>"
        f'<p><a href="{reset_link}">Click here to set your password</a></p>'
        f"<p>Or copy and paste this URL into your browser:<br><code>{reset_link}</code></p>"
        f"<p>This link expires in {settings.PASSWORD_RESET_TOKEN_TTL_HOURS} hours.</p>"
        f"<p>If you did not request this, you can ignore this email.</p>"
    )

    sent = await email_svc.send_email(
        to_email=teacher.email,
        subject=subject,
        body_text=body_text,
        body_html=body_html,
    )

    return raw_token, sent


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

    # Force re-authentication across all active sessions by revoking refresh tokens
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.teacher_id == teacher.id)
        .values(revoked=True)
    )

    return teacher
