"""
The two-of-three factor policy.

One place decides what a session needs, so the rule cannot drift between the
login endpoints, the enrollment endpoints and the guard that decides a factor may
be removed.

The three factors are **password**, **passkey** and **TOTP**, and a session needs
two *distinct* ones. A teacher with all three enrolled picks which two to use, so
losing any single factor does not lock them out.

Two rules, not one:

1. At least two factors enrolled, or the account cannot authenticate at all and
   is held in the enrollment scope.
2. At least one *key-capable* factor. TOTP authenticates but cannot unwrap the
   data key — the secret lives server-side and a six-digit code carries no
   entropy to derive from. An account whose only factors were TOTP and a passkey
   without PRF could sign in and still not read its own exams.
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

# Factors that can also yield a key-encryption key for the data-key envelope.
# A passkey only qualifies when its authenticator supports the PRF extension,
# which is why membership here is necessary but not sufficient — see
# `key_capable_factors`.
KEY_CAPABLE_FACTORS: frozenset[str] = frozenset({"password", "passkey"})


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
    Of the enrolled factors, those that can unwrap the data key.

    A password counts when a usable password wrap exists — an admin-forced
    password write invalidates that wrap, and a factor that authenticates but
    cannot open the vault does not satisfy this rule.
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
    return len({f for f in amr if f in ALL_FACTORS}) >= REQUIRED_FACTOR_COUNT


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
    Whether removing *kind* would leave the account unusable.

    This single guard is what makes "any two of three" safe to offer: without it
    a teacher could delete their way below the policy, or below their last means
    of opening their own data.
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
