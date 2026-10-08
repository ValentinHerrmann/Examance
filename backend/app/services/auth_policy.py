"""
The two-of-three factor policy: the one place deciding what a session needs.
A session needs a passkey alone or two distinct factors (password, passkey, TOTP), and at least
one enrolled factor must be key-capable (rules in backend/CLAUDE.md).
"""
from __future__ import annotations

import uuid
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.key_envelope import KeyEnvelope
from app.models.mfa_credential import MfaCredential
from app.models.teacher import Teacher

FactorKind = Literal["password", "passkey", "totp"]

ALL_FACTORS: tuple[FactorKind, ...] = ("password", "passkey", "totp")

# Never below two. The setting exists so the policy can be *tightened*, and the
# config validator refuses a smaller value — a hardened login that an
# environment variable can switch off is not one.
REQUIRED_FACTOR_COUNT = 2

# Factors that can also yield a key-encryption key for the data-key envelope. A passkey only
# qualifies if its authenticator supports PRF, so membership here is necessary but not
# sufficient (see `key_capable_factors`).
KEY_CAPABLE_FACTORS: frozenset[str] = frozenset({"password", "passkey"})

# Factors that complete a sign-in by themselves. Only a passkey: the ceremony
# requires user verification, so the authenticator has checked a biometric or
# PIN on top of possession. Never add password or TOTP here.
SELF_SUFFICIENT_FACTORS: frozenset[str] = frozenset({"passkey"})


async def enrolled_factors(db: AsyncSession, teacher: Teacher) -> set[FactorKind]:
    """Which factors this account can actually present today."""
    factors: set[FactorKind] = set()

    if teacher.password_hash is not None:
        factors.add("password")

    totp = await db.execute(
        select(MfaCredential.teacher_id).where(
            MfaCredential.teacher_id == teacher.id,
            MfaCredential.confirmed_at.is_not(None),
        )
    )
    if totp.scalar_one_or_none() is not None:
        factors.add("totp")

    # Passkeys arrive with the WebAuthn work. Until that table exists an account
    # simply has no passkey factor, which is the correct answer rather than an
    # error.
    try:
        from app.models.webauthn_credential import WebAuthnCredential

        passkey = await db.execute(
            select(WebAuthnCredential.credential_id).where(
                WebAuthnCredential.teacher_id == teacher.id
            )
        )
        if passkey.first() is not None:
            factors.add("passkey")
    except ImportError:
        pass

    return factors


async def key_capable_factors(db: AsyncSession, teacher: Teacher) -> set[FactorKind]:
    """
    Of the enrolled factors, those that can unwrap the data key. A password counts only while a
    usable wrap exists (an admin-forced password write invalidates it).
    """
    factors = await enrolled_factors(db, teacher)
    capable: set[FactorKind] = set()

    if "password" in factors:
        wrap = await db.execute(
            select(KeyEnvelope.id).where(
                KeyEnvelope.teacher_id == teacher.id,
                KeyEnvelope.kind == "password",
                KeyEnvelope.invalidated_at.is_(None),
            )
        )
        if wrap.first() is not None:
            capable.add("password")

    if "passkey" in factors:
        wrap = await db.execute(
            select(KeyEnvelope.id).where(
                KeyEnvelope.teacher_id == teacher.id,
                KeyEnvelope.kind == "passkey",
                KeyEnvelope.invalidated_at.is_(None),
            )
        )
        if wrap.first() is not None:
            capable.add("passkey")

    return capable


async def is_enrollment_complete(db: AsyncSession, teacher: Teacher) -> bool:
    """True when this account may hold a full session."""
    return len(await enrolled_factors(db, teacher)) >= REQUIRED_FACTOR_COUNT


def satisfies(amr: list[str]) -> bool:
    """True when the factors already presented add up to a full session."""
    presented = {f for f in amr if f in ALL_FACTORS}
    if presented & SELF_SUFFICIENT_FACTORS:
        return True
    return len(presented) >= REQUIRED_FACTOR_COUNT


async def remaining_factors(
    db: AsyncSession, teacher: Teacher, amr: list[str]
) -> list[str]:
    """
    Which factors this account can still present.

    Returned only *after* a factor has been proven. Answering it earlier would
    turn the endpoint into an account-existence and account-profile oracle.
    """
    enrolled = await enrolled_factors(db, teacher)
    presented = {f for f in amr if f in ALL_FACTORS}
    return sorted(f for f in enrolled if f not in presented)


async def may_remove_factor(
    db: AsyncSession, teacher: Teacher, kind: FactorKind
) -> tuple[bool, str | None]:
    """
    Whether removing *kind* would leave the account unusable: below the policy, or below its last
    means of opening its own data. This guard makes "any two of three" safe to offer.
    """
    enrolled = await enrolled_factors(db, teacher)
    if kind not in enrolled:
        return True, None

    if len(enrolled) - 1 < REQUIRED_FACTOR_COUNT:
        return False, "That would leave the account with too few sign-in factors."

    if kind in KEY_CAPABLE_FACTORS:
        capable = await key_capable_factors(db, teacher)
        if capable == {kind}:
            return False, "That is the only factor that can still decrypt this account's data."

    return True, None


async def teacher_by_id(db: AsyncSession, teacher_id: uuid.UUID) -> Teacher | None:
    result = await db.execute(select(Teacher).where(Teacher.id == teacher_id))
    return result.scalar_one_or_none()
