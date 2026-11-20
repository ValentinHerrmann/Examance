"""Key-envelope router — /api/v1/keys/*: wrapped copies of a teacher's data key. Opaque to the server: ciphertext, public salt and KDF params, never a password or recovery code. A teacher can only read or write their own envelopes."""
from __future__ import annotations

from typing import cast

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select

from app.dependencies import (
    DB,
    PendingSession,
    PendingTeacher,
    require_not_frozen,
)
from app.models.key_envelope import KeyEnvelope
from app.models.teacher import Teacher
from app.schemas.binary import encode_b64
from app.schemas.key_envelope import (
    EnvelopeKind,
    KeyEnvelopeListOut,
    KeyEnvelopeOut,
    KeyEnvelopeSetIn,
)
from app.services import audit as audit_svc
from app.services.key_envelope import replace_envelope_set

router = APIRouter(prefix="/keys", tags=["keys"])

# Reads precede a full session (the reset and vault prompts unwrap first); the rows are ciphertext.
_ENVELOPE_READ_SCOPES = {"full", "enroll", "auth_pending", "reset_pending"}
# Writes need the finished sign-in, or an account still enrolling: one proven factor must never replace or drop the only wraps of the data key. A reset stores its set via /auth/reset-password.
_ENVELOPE_WRITE_SCOPES = {"full", "enroll"}


def _require_envelope_scope(session: PendingSession, *, write: bool = False) -> Teacher:
    if session.scope not in (_ENVELOPE_WRITE_SCOPES if write else _ENVELOPE_READ_SCOPES):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authenticated.",
            headers={"code": "ERR_UNAUTHORIZED"},
        )
    return session.teacher


def _to_out(row: KeyEnvelope) -> KeyEnvelopeOut:
    return KeyEnvelopeOut(
        id=row.id,
        # The column is a string; the schema pins it to the three valid kinds.
        kind=cast(EnvelopeKind, row.kind),
        credential_id_b64=encode_b64(row.credential_id) if row.credential_id else None,
        kdf=row.kdf,
        kdf_salt_b64=encode_b64(row.kdf_salt),
        kdf_params=row.kdf_params,
        wrapped_bundle_b64=encode_b64(row.wrapped_bundle),
        wrap_iv_b64=encode_b64(row.wrap_iv),
        key_id_b64=encode_b64(row.key_id),
        envelope_version=row.envelope_version,
        invalidated_at=row.invalidated_at,
        created_at=row.created_at,
    )


@router.get("/envelopes")
async def list_envelopes(
    db: DB,
    session: PendingTeacher,
) -> KeyEnvelopeListOut:
    """Return every wrap for the calling teacher, invalidated rows included and marked, so the client can tell a factor orphaned by an admin password write from one never enrolled."""
    teacher = _require_envelope_scope(session)
    result = await db.execute(
        select(KeyEnvelope)
        .where(KeyEnvelope.teacher_id == teacher.id)
        .order_by(KeyEnvelope.created_at)
    )
    rows = list(result.scalars().all())
    return KeyEnvelopeListOut(
        key_id_b64=encode_b64(rows[0].key_id) if rows else None,
        envelopes=[_to_out(row) for row in rows],
    )


@router.put(
    "/envelopes",
    dependencies=[Depends(require_not_frozen)],
)
async def replace_envelopes(
    body: KeyEnvelopeSetIn,
    request: Request,
    db: DB,
    session: PendingTeacher,
) -> KeyEnvelopeListOut:
    """Replace the teacher's whole envelope set in one transaction. Wholesale on purpose: merging could leave a new password wrap beside a recovery wrap holding the previous DEK, which looks healthy until someone needs to recover."""
    teacher = _require_envelope_scope(session, write=True)
    enrolling = session.scope == "enroll"
    rows = await replace_envelope_set(db, teacher, body, keep_secret_wraps=enrolling)

    await audit_svc.log(db, request, teacher, "KEY_ENVELOPE_RESET")

    return KeyEnvelopeListOut(
        key_id_b64=body.key_id_b64,
        envelopes=[_to_out(row) for row in rows],
    )

