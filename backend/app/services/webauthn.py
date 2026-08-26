"""
WebAuthn ceremonies.

The parsing is `py_webauthn`'s rather than ours on purpose: attestation objects
are CBOR/COSE structures, and hand-rolled parsers for those are how relying
parties get CVEs.

A passkey is one of the three sign-in factors. Where the authenticator supports
the PRF extension it is also key-capable: the browser derives a secret from the
authenticator that never leaves the device, and that secret wraps a copy of the
data key. Where it does not, the passkey authenticates and nothing more — a
distinction the UI has to surface, not bury.
"""
from __future__ import annotations

import base64
import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import options_to_json
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.config import settings
from app.models.teacher import Teacher
from app.models.webauthn_credential import WebAuthnCredential
from app.services import ephemeral_store

# Challenges are single-use and short-lived, so they belong in the ephemeral
# store rather than the database.
_CHALLENGE_PREFIX = "webauthn:challenge:"
_CHALLENGE_TTL_SECONDS = 300

PRF_SALT_BYTES = 32


def _expected_origins() -> list[str]:
    origins = list(settings.CORS_ALLOWED_ORIGINS)
    if settings.FRONTEND_URL and settings.FRONTEND_URL not in origins:
        origins.append(settings.FRONTEND_URL.rstrip("/"))
    return origins


async def _store_challenge(handle: str, challenge: bytes) -> None:
    # The store holds integers, so the challenge is kept as its own key with a
    # presence marker; the handle is what the client echoes back.
    await ephemeral_store.set(
        _CHALLENGE_PREFIX + handle + ":" + base64.urlsafe_b64encode(challenge).decode(),
        1,
        _CHALLENGE_TTL_SECONDS,
    )


async def _take_challenge(handle: str, challenge_b64: str) -> bool:
    key = _CHALLENGE_PREFIX + handle + ":" + challenge_b64
    if await ephemeral_store.get(key) is None:
        return False
    await ephemeral_store.delete(key)
    return True


async def registration_options(db: AsyncSession, teacher: Teacher) -> tuple[str, str]:
    """
    Options for registering a new passkey, plus the handle that ties them to it.

    Existing credentials are excluded so an authenticator that already holds a
    passkey for this account says so rather than silently making a second one.
    """
    existing = await db.execute(
        select(WebAuthnCredential.credential_id).where(
            WebAuthnCredential.teacher_id == teacher.id
        )
    )
    exclude = [
        PublicKeyCredentialDescriptor(id=row[0]) for row in existing.all()
    ]

    options = generate_registration_options(
        rp_id=settings.WEBAUTHN_RP_ID,
        rp_name=settings.WEBAUTHN_RP_NAME,
        user_id=teacher.id.bytes,
        user_name=teacher.email,
        user_display_name=teacher.email,
        exclude_credentials=exclude,
        authenticator_selection=AuthenticatorSelectionCriteria(
            # Discoverable, because a passkey has to be able to identify the
            # account by itself — it is a first-position factor.
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
    )
    handle = secrets.token_urlsafe(16)
    await _store_challenge(handle, options.challenge)
    return handle, options_to_json(options)


async def verify_registration(
    db: AsyncSession,
    teacher: Teacher,
    handle: str,
    challenge_b64: str,
    credential_json: str,
    *,
    supports_prf: bool,
    nickname: str | None,
) -> WebAuthnCredential:
    """Verify a registration ceremony and store the resulting credential."""
    if not await _take_challenge(handle, challenge_b64):
        raise ValueError("This registration attempt has expired. Try again.")

    verified = verify_registration_response(
        credential=credential_json,
        expected_challenge=base64.urlsafe_b64decode(challenge_b64),
        expected_rp_id=settings.WEBAUTHN_RP_ID,
        expected_origin=_expected_origins(),
    )

    credential = WebAuthnCredential(
        credential_id=verified.credential_id,
        teacher_id=teacher.id,
        public_key=verified.credential_public_key,
        sign_count=verified.sign_count,
        aaguid=str(verified.aaguid) if verified.aaguid else None,
        prf_salt=secrets.token_bytes(PRF_SALT_BYTES),
        supports_prf=supports_prf,
        nickname=nickname,
    )
    db.add(credential)
    await db.flush()
    return credential


async def authentication_options() -> tuple[str, str]:
    """
    Options for a passkey sign-in.

    No credential list and no account name: the ceremony uses a discoverable
    credential, so the authenticator names the account. Asking the server which
    passkeys an email has would be the account-profile oracle this design avoids.
    """
    options = generate_authentication_options(
        rp_id=settings.WEBAUTHN_RP_ID,
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    handle = secrets.token_urlsafe(16)
    await _store_challenge(handle, options.challenge)
    return handle, options_to_json(options)


async def verify_authentication(
    db: AsyncSession, handle: str, challenge_b64: str, credential_json: str
) -> WebAuthnCredential:
    """Verify a sign-in ceremony and return the credential that answered it."""
    if not await _take_challenge(handle, challenge_b64):
        raise ValueError("This sign-in attempt has expired. Try again.")

    import json

    parsed = json.loads(credential_json)
    raw_id = parsed.get("rawId") or parsed.get("id")
    if not raw_id:
        raise ValueError("The authenticator response is missing its credential id.")
    credential_id = base64.urlsafe_b64decode(raw_id + "=" * (-len(raw_id) % 4))

    result = await db.execute(
        select(WebAuthnCredential).where(WebAuthnCredential.credential_id == credential_id)
    )
    stored = result.scalar_one_or_none()
    if stored is None:
        raise ValueError("Unknown passkey.")

    verified = verify_authentication_response(
        credential=credential_json,
        expected_challenge=base64.urlsafe_b64decode(challenge_b64),
        expected_rp_id=settings.WEBAUTHN_RP_ID,
        expected_origin=_expected_origins(),
        credential_public_key=stored.public_key,
        credential_current_sign_count=stored.sign_count,
        require_user_verification=True,
    )

    # A counter that goes backwards is the spec's clone signal. A constant 0
    # means the authenticator does not count at all, which most platform ones
    # do not — rejecting that would break every iCloud-keychain passkey.
    if stored.sign_count > 0 and verified.new_sign_count < stored.sign_count:
        raise ValueError("This passkey's counter went backwards; it may have been cloned.")

    stored.sign_count = verified.new_sign_count
    stored.last_used_at = datetime.now(tz=UTC)
    await db.flush()
    return stored


async def list_credentials(db: AsyncSession, teacher_id: uuid.UUID) -> list[WebAuthnCredential]:
    result = await db.execute(
        select(WebAuthnCredential)
        .where(WebAuthnCredential.teacher_id == teacher_id)
        .order_by(WebAuthnCredential.created_at)
    )
    return list(result.scalars().all())


async def delete_credential(
    db: AsyncSession, teacher_id: uuid.UUID, credential_id: bytes
) -> bool:
    result = await db.execute(
        select(WebAuthnCredential).where(
            WebAuthnCredential.credential_id == credential_id,
            WebAuthnCredential.teacher_id == teacher_id,
        )
    )
    stored = result.scalar_one_or_none()
    if stored is None:
        return False
    await db.delete(stored)
    await db.flush()
    return True
