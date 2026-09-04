"""
Key-envelope router — /api/v1/keys/*

Stores the wrapped copies of a teacher's data-encryption key. Everything here is
opaque to the server: it holds ciphertext, a public salt and public KDF
parameters, and never sees a password, a recovery code or a PRF output.

A teacher can only ever read or write their own envelopes.
"""
from __future__ import annotations

import base64
import uuid
from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import PendingSession, get_pending_teacher
from app.models.key_envelope import KeyEnvelope
from app.models.teacher import Teacher
from app.schemas.key_envelope import (
    EnvelopeKind,
    KeyEnvelopeListOut,
    KeyEnvelopeOut,
    KeyEnvelopeSetIn,
)
from app.services import audit as audit_svc
from app.services.key_envelope import replace_envelope_set

router = APIRouter(prefix="/keys", tags=["keys"])

# The envelope has to be reachable before a full session exists. An account that
# predates the envelope has only a password, so it lands in the enrollment scope
# — and the wizard that gets it out of there is the same one that stores its key
# for the first time, while the password is still in hand. A password reset lands
# in `reset_pending` for the same reason.
#
# This is not a hole in the two-of-three policy: everything here is ciphertext
# the caller has to be able to unwrap anyway, and it is scoped to the account
# named in the token.
_ENVELOPE_SCOPES = {"full", "enroll", "auth_pending", "reset_pending"}


def _require_envelope_scope(session: PendingSession) -> Teacher:
    if session.scope not in _ENVELOPE_SCOPES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authenticated.",
            headers={"code": "ERR_UNAUTHORIZED"},
        )
    return session.teacher

def _b64(value: bytes) -> str:
    return base64.b64encode(value).decode()


def _to_out(row: KeyEnvelope) -> KeyEnvelopeOut:
    return KeyEnvelopeOut(
        id=row.id,
        # The column is a string; the schema pins it to the three valid kinds.
        kind=cast(EnvelopeKind, row.kind),
        credential_id_b64=_b64(row.credential_id) if row.credential_id else None,
        kdf=row.kdf,
        kdf_salt_b64=_b64(row.kdf_salt),
        kdf_params=row.kdf_params,
        wrapped_bundle_b64=_b64(row.wrapped_bundle),
        wrap_iv_b64=_b64(row.wrap_iv),
        key_id_b64=_b64(row.key_id),
        envelope_version=row.envelope_version,
        invalidated_at=row.invalidated_at,
        created_at=row.created_at,
    )


@router.get("/envelopes", response_model=KeyEnvelopeListOut)
async def list_envelopes(
    session: PendingSession = Depends(get_pending_teacher),
    db: AsyncSession = Depends(get_db),
) -> KeyEnvelopeListOut:
    """
    Return every wrap for the calling teacher.

    Invalidated rows are returned too, marked as such, so the client can tell
    "this factor was orphaned by an admin password write" apart from "this
    factor was never enrolled" and offer the right recovery path.
    """
    teacher = _require_envelope_scope(session)
    result = await db.execute(
        select(KeyEnvelope)
        .where(KeyEnvelope.teacher_id == teacher.id)
        .order_by(KeyEnvelope.created_at)
    )
    rows = list(result.scalars().all())
    return KeyEnvelopeListOut(
        key_id_b64=_b64(rows[0].key_id) if rows else None,
        envelopes=[_to_out(row) for row in rows],
    )


@router.put("/envelopes", response_model=KeyEnvelopeListOut)
async def replace_envelopes(
    body: KeyEnvelopeSetIn,
    request: Request,
    session: PendingSession = Depends(get_pending_teacher),
    db: AsyncSession = Depends(get_db),
) -> KeyEnvelopeListOut:
    """
    Replace the teacher's whole envelope set in one transaction.

    Wholesale replacement is deliberate. Merging risks leaving a set where the
    password wrap is new and the recovery wrap still holds the previous DEK,
    which is indistinguishable from a working set until the day someone needs to
    recover with it.
    """
    teacher = _require_envelope_scope(session)
    rows = await replace_envelope_set(db, teacher, body)

    await audit_svc.write(
        db,
        teacher_id=teacher.id,
        teacher_email=teacher.email,
        action="KEY_ENVELOPE_RESET",
        request_ip=request.client.host if request.client else None,
    )

    return KeyEnvelopeListOut(
        key_id_b64=body.key_id_b64,
        envelopes=[_to_out(row) for row in rows],
    )


@router.delete("/envelopes/{envelope_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_envelope(
    envelope_id: uuid.UUID,
    session: PendingSession = Depends(get_pending_teacher),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Remove a single wrap — used when a passkey is deregistered.

    The recovery wrap cannot be deleted this way: it is the factor that always
    works, and dropping it would leave the account one forgotten password away
    from unreadable data.
    """
    teacher = _require_envelope_scope(session)
    result = await db.execute(
        select(KeyEnvelope).where(
            KeyEnvelope.id == envelope_id, KeyEnvelope.teacher_id == teacher.id
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Envelope not found.")
    if row.kind == "recovery":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The recovery wrap cannot be removed.",
            headers={"code": "ERR_LAST_FACTOR_PROTECTED"},
        )
    await db.delete(row)
