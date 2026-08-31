"""
TOTP enrollment and verification, and the backup codes that stand in for it.

Everything that touches the stored secret lives here so the encryption boundary
(`mfa_secret.py`) has exactly one set of callers.
"""
from __future__ import annotations

import hmac
import secrets
import time
import uuid
from datetime import UTC, datetime

from cryptography.exceptions import InvalidTag
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mfa_credential import MfaBackupCode, MfaCredential
from app.models.teacher import Teacher
from app.services import totp as totp_svc
from app.services.crypto import verify_password
from app.services.mfa_secret import backup_code_digest, decrypt_secret, encrypt_secret

BACKUP_CODE_COUNT = 10

# 10 characters from a 32-symbol alphabet is ~50 bits — far beyond guessing at
# the rate the login throttle allows, and still short enough to write down.
_BACKUP_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_BACKUP_CODE_LENGTH = 10


def generate_backup_code() -> str:
    body = "".join(secrets.choice(_BACKUP_ALPHABET) for _ in range(_BACKUP_CODE_LENGTH))
    return f"{body[:5]}-{body[5:]}"


def normalize_backup_code(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch in _BACKUP_ALPHABET)


async def get_credential(db: AsyncSession, teacher_id: uuid.UUID) -> MfaCredential | None:
    result = await db.execute(
        select(MfaCredential).where(MfaCredential.teacher_id == teacher_id)
    )
    return result.scalar_one_or_none()


async def start_enrollment(db: AsyncSession, teacher: Teacher) -> str:
    """
    Create (or replace) an unconfirmed enrollment and return its otpauth URI.

    Replacing an unconfirmed row is deliberate: a teacher who abandons the
    enrollment screen and comes back should get a working secret, not a
    stalemate. A *confirmed* enrollment is never replaced this way — removing one
    goes through the factor-removal guard.
    """
    existing = await get_credential(db, teacher.id)
    if existing is not None and existing.confirmed_at is not None:
        raise ValueError("An authenticator is already enrolled for this account.")

    secret = totp_svc.generate_secret()
    secret_ct, secret_iv = encrypt_secret(secret)

    if existing is None:
        db.add(
            MfaCredential(teacher_id=teacher.id, secret_ct=secret_ct, secret_iv=secret_iv)
        )
    else:
        existing.secret_ct = secret_ct
        existing.secret_iv = secret_iv
        existing.last_used_step = None
    await db.flush()

    return totp_svc.provisioning_uri(secret, teacher.email)


async def _load_secret(credential: MfaCredential) -> bytes | None:
    try:
        return decrypt_secret(credential.secret_ct, credential.secret_iv)
    except InvalidTag:
        # SECRET_KEY was rotated. The enrollment is gone; say so by failing the
        # code rather than by accepting anything.
        return None


async def confirm_enrollment(db: AsyncSession, teacher: Teacher, code: str) -> bool:
    """Accept the first correct code, which is what makes the factor count."""
    credential = await get_credential(db, teacher.id)
    if credential is None or credential.confirmed_at is not None:
        return False

    secret = await _load_secret(credential)
    if secret is None:
        return False

    step = totp_svc.verify_code(
        secret, code, int(time.time()), last_used_step=credential.last_used_step
    )
    if step is None:
        return False

    credential.confirmed_at = datetime.now(tz=UTC)
    credential.last_used_step = step
    await db.flush()
    return True


async def verify_totp(db: AsyncSession, teacher: Teacher, code: str) -> bool:
    """Check a code against a confirmed enrollment, refusing replays."""
    credential = await get_credential(db, teacher.id)
    if credential is None or credential.confirmed_at is None:
        return False

    secret = await _load_secret(credential)
    if secret is None:
        return False

    step = totp_svc.verify_code(
        secret, code, int(time.time()), last_used_step=credential.last_used_step
    )
    if step is None:
        return False

    credential.last_used_step = step
    credential.last_used_at = datetime.now(tz=UTC)
    await db.flush()
    return True


async def issue_backup_codes(db: AsyncSession, teacher: Teacher) -> list[str]:
    """
    Replace the teacher's backup codes and return the plaintext once.

    Stored as keyed digests — see `mfa_secret.backup_code_digest` for why that
    is the right primitive here and Argon2id was not.
    """
    existing = await db.execute(
        select(MfaBackupCode).where(MfaBackupCode.teacher_id == teacher.id)
    )
    for row in existing.scalars().all():
        await db.delete(row)

    codes = [generate_backup_code() for _ in range(BACKUP_CODE_COUNT)]
    for code in codes:
        db.add(
            MfaBackupCode(
                teacher_id=teacher.id,
                code_hash=backup_code_digest(normalize_backup_code(code)),
            )
        )
    await db.flush()
    return codes


async def consume_backup_code(db: AsyncSession, teacher: Teacher, code: str) -> bool:
    """
    Spend one backup code.

    Looked up by keyed digest, so the work is one hash and one indexed read
    however many codes are stored, and no comparison depends on the submitted
    value.

    Sets issued before the digest existed are Argon2id hashes and cannot be
    converted — the plaintext is gone. Those are still verified row by row, so
    the accounts holding them keep working; a set regenerated from the security
    panel replaces them with digests and stops paying for it.
    """
    normalized = normalize_backup_code(code)
    if not normalized:
        return False

    result = await db.execute(
        select(MfaBackupCode).where(
            MfaBackupCode.teacher_id == teacher.id,
            MfaBackupCode.used_at.is_(None),
        )
    )
    rows = list(result.scalars().all())
    digest = backup_code_digest(normalized)

    matched: MfaBackupCode | None = None
    for row in rows:
        if hmac.compare_digest(row.code_hash, digest):
            matched = row
            break

    if matched is None:
        legacy = [row for row in rows if row.code_hash.startswith("$argon2")]
        for row in legacy:
            if verify_password(normalized, row.code_hash) and matched is None:
                matched = row

    if matched is None:
        return False

    now = datetime.now(tz=UTC)
    matched.used_at = now

    # A backup code stands in for the authenticator, so it counts as the
    # authenticator having been used. `last_used_step` is left alone: that one
    # guards code replay and a backup code is not a code.
    credential = await get_credential(db, teacher.id)
    if credential is not None:
        credential.last_used_at = now

    await db.flush()
    return True


async def remaining_backup_codes(db: AsyncSession, teacher_id: uuid.UUID) -> int:
    result = await db.execute(
        select(MfaBackupCode.id).where(
            MfaBackupCode.teacher_id == teacher_id,
            MfaBackupCode.used_at.is_(None),
        )
    )
    return len(result.all())


async def disable(db: AsyncSession, teacher_id: uuid.UUID) -> None:
    """Remove the enrollment and its backup codes."""
    credential = await get_credential(db, teacher_id)
    if credential is not None:
        await db.delete(credential)
    codes = await db.execute(
        select(MfaBackupCode).where(MfaBackupCode.teacher_id == teacher_id)
    )
    for row in codes.scalars().all():
        await db.delete(row)
    await db.flush()
