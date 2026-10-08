"""
Key-envelope maintenance the server may perform. It can never re-wrap (that needs the new
password and the data key), but must mark the `password` wrap stale when a password is set
outside the browser flow; otherwise the client derives a key that opens nothing (blank vault).
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.key_envelope import KeyEnvelope
from app.models.teacher import Teacher
from app.schemas.binary import ARGON2_SALT_BYTES, GCM_IV_BYTES, decode_b64
from app.schemas.key_envelope import KEY_ID_BYTES, KeyEnvelopeSetIn


async def invalidate_password_wrap(db: AsyncSession, teacher_id: uuid.UUID) -> None:
    """
    Mark the teacher's password wrap unusable after a server-side password write.

    The recovery and passkey wraps are left alone: they still hold the same data
    key, and they are how the teacher gets back in.
    """
    await db.execute(
        update(KeyEnvelope)
        .where(
            KeyEnvelope.teacher_id == teacher_id,
            KeyEnvelope.kind == "password",
            KeyEnvelope.invalidated_at.is_(None),
        )
        .values(invalidated_at=datetime.now(tz=UTC))
    )


# Wrapped bundles are three 32-byte keys plus JSON framing and GCM overhead.
# Generous, but bounded: this column is written by the client.
MAX_WRAPPED_BUNDLE_BYTES = 4096
MAX_CREDENTIAL_ID_BYTES = 1023


async def replace_envelope_set(
    db: AsyncSession, teacher: Teacher, body: KeyEnvelopeSetIn
) -> list[KeyEnvelope]:
    """
    Replace a teacher's whole envelope set, validating it first. Wholesale by design: merging could
    pair a new data key in the password wrap with the old one in the recovery wrap. Shared with
    password reset, which writes the new wrap in the same transaction as the new password.
    """
    key_id = decode_b64(body.key_id_b64, "key_id_b64", expected_len=KEY_ID_BYTES)

    seen: set[tuple[str, str | None]] = set()
    rows: list[KeyEnvelope] = []
    for envelope in body.envelopes:
        salt = decode_b64(
            envelope.kdf_salt_b64, "kdf_salt_b64", expected_len=ARGON2_SALT_BYTES
        )
        iv = decode_b64(envelope.wrap_iv_b64, "wrap_iv_b64", expected_len=GCM_IV_BYTES)
        bundle = decode_b64(envelope.wrapped_bundle_b64, "wrapped_bundle_b64")
        if not bundle or len(bundle) > MAX_WRAPPED_BUNDLE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Field 'wrapped_bundle_b64' has an implausible length.",
                headers={"code": "ERR_BAD_REQUEST"},
            )

        credential_id: bytes | None = None
        if envelope.credential_id_b64 is not None:
            credential_id = decode_b64(envelope.credential_id_b64, "credential_id_b64")
            if not credential_id or len(credential_id) > MAX_CREDENTIAL_ID_BYTES:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Field 'credential_id_b64' has an implausible length.",
                    headers={"code": "ERR_BAD_REQUEST"},
                )
        if envelope.kind == "passkey" and credential_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A passkey wrap must name the credential it belongs to.",
                headers={"code": "ERR_BAD_REQUEST"},
            )

        factor = (envelope.kind, envelope.credential_id_b64)
        if factor in seen:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The envelope set holds two wraps for the same factor.",
                headers={"code": "ERR_BAD_REQUEST"},
            )
        seen.add(factor)

        rows.append(
            KeyEnvelope(
                teacher_id=teacher.id,
                kind=envelope.kind,
                credential_id=credential_id,
                kdf=envelope.kdf,
                kdf_salt=salt,
                kdf_params=envelope.kdf_params,
                wrapped_bundle=bundle,
                wrap_iv=iv,
                key_id=key_id,
                envelope_version=body.envelope_version,
            )
        )

    if not any(row.kind == "recovery" for row in rows):
        # Without it, a teacher who loses their password has no way back to
        # their data at all. This is the one wrap that is never optional.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The envelope set must include a recovery wrap.",
            headers={"code": "ERR_BAD_REQUEST"},
        )

    await db.execute(delete(KeyEnvelope).where(KeyEnvelope.teacher_id == teacher.id))
    db.add_all(rows)
    await db.flush()
    return rows
