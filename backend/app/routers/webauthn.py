"""
Passkeys — /api/v1/webauthn/*

A passkey is one of the three sign-in factors, and it never short-circuits the
two-of-three rule on its own: the ceremony proves possession plus a local user
check, which is strong, but the policy asks for two *distinct* kinds and this is
one of them.

Registration needs a session. Authentication does not — that is the point of a
first-position factor.
"""
from __future__ import annotations

import base64

import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import PendingSession, get_pending_teacher
from app.middleware.rate_limit import limiter
from app.routers.auth import advance_sign_in
from app.schemas.auth import AuthResponse
from app.schemas.webauthn import (
    AuthenticationVerifyRequest,
    CeremonyOptionsResponse,
    CredentialListResponse,
    CredentialSummary,
    RegistrationVerifyRequest,
)
from app.services import audit as audit_svc
from app.services import auth_policy, pending_token
from app.services import webauthn as webauthn_svc
from app.services.jwt import decode_token

router = APIRouter(prefix="/webauthn", tags=["webauthn"])

_REGISTER_SCOPES = {"full", "enroll", "auth_pending"}


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode()


@router.post("/register/options", response_model=CeremonyOptionsResponse)
@limiter.limit("20/hour")
async def register_options(
    request: Request,
    session: PendingSession = Depends(get_pending_teacher),
    db: AsyncSession = Depends(get_db),
) -> CeremonyOptionsResponse:
    """Options for adding a passkey. Reachable from enrollment as well as a session."""
    if session.scope not in _REGISTER_SCOPES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authenticated.",
            headers={"code": "ERR_UNAUTHORIZED"},
        )
    handle, options_json = await webauthn_svc.registration_options(db, session.teacher)
    import json

    challenge = json.loads(options_json)["challenge"]
    return CeremonyOptionsResponse(
        handle=handle, challenge_b64=challenge, options_json=options_json
    )


@router.post("/register/verify", response_model=CredentialSummary)
@limiter.limit("20/hour")
async def register_verify(
    body: RegistrationVerifyRequest,
    request: Request,
    session: PendingSession = Depends(get_pending_teacher),
    db: AsyncSession = Depends(get_db),
) -> CredentialSummary:
    if session.scope not in _REGISTER_SCOPES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authenticated.",
            headers={"code": "ERR_UNAUTHORIZED"},
        )
    try:
        credential = await webauthn_svc.verify_registration(
            db,
            session.teacher,
            body.handle,
            body.challenge_b64,
            body.credential_json,
            supports_prf=body.supports_prf,
            nickname=body.nickname,
        )
    except Exception as exc:  # noqa: BLE001 - every ceremony failure reads alike
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc) or "The passkey could not be registered.",
            headers={"code": "ERR_PASSKEY_FAILED"},
        ) from None

    await audit_svc.write(
        db,
        teacher_id=session.teacher.id,
        teacher_email=session.teacher.email,
        action="PASSKEY_REGISTERED",
        request_ip=request.client.host if request.client else None,
    )
    return CredentialSummary(
        credential_id_b64=_b64(credential.credential_id),
        nickname=credential.nickname,
        supports_prf=credential.supports_prf,
        prf_salt_b64=_b64(credential.prf_salt),
        created_at=credential.created_at,
        last_used_at=credential.last_used_at,
    )


@router.post("/login/options", response_model=CeremonyOptionsResponse)
@limiter.limit("30/minute")
async def login_options(request: Request) -> CeremonyOptionsResponse:
    """
    Options for a passkey sign-in.

    Unauthenticated and rate-limited: it allocates a challenge per call, and it
    takes no account identifier, so there is nothing here to probe with.
    """
    handle, options_json = await webauthn_svc.authentication_options()
    import json

    challenge = json.loads(options_json)["challenge"]
    return CeremonyOptionsResponse(
        handle=handle, challenge_b64=challenge, options_json=options_json
    )


@router.post("/login/verify", response_model=AuthResponse)
@limiter.limit("10/minute;50/hour")
async def login_verify(
    body: AuthenticationVerifyRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    access_token: str | None = Cookie(default=None),
) -> AuthResponse:
    """
    Present a passkey as a sign-in factor.

    Contributes exactly one factor — the `passkey` kind — whether it comes first
    or second, and never short-circuits the policy on its own.

    The cookie is read directly rather than through a dependency because this
    endpoint has to work both ways: with no session at all (passkey first) and
    with a sign-in already part-way through (passkey second).
    """
    already: list[str] = []
    flow = "auth_pending"
    pending_jti: str | None = None
    pending_subject: str | None = None
    if access_token:
        try:
            payload = decode_token(access_token)
            scope = str(payload.get("scope", "full"))
            if scope in {"auth_pending", "reset_pending"}:
                amr = payload.get("amr") or []
                already = [str(f) for f in amr] if isinstance(amr, list) else []
                flow = scope
                pending_jti = payload.get("jti")
                pending_subject = str(payload.get("sub") or "")
        except jwt.InvalidTokenError:
            # A stale or malformed cookie simply means "no sign-in in progress".
            already = []

    if "passkey" in already:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That factor has already been used for this sign-in.",
            headers={"code": "ERR_FACTOR_ALREADY_PRESENTED"},
        )

    if pending_jti is not None and not await pending_token.consume(pending_jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This sign-in step has expired. Start again.",
            headers={"code": "ERR_FACTOR_REQUIRED"},
        )

    try:
        credential = await webauthn_svc.verify_authentication(
            db, body.handle, body.challenge_b64, body.credential_json
        )
    except Exception as exc:  # noqa: BLE001 - every ceremony failure reads alike
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc) or "The passkey could not be verified.",
            headers={"code": "ERR_PASSKEY_FAILED"},
        ) from None

    teacher = await auth_policy.teacher_by_id(db, credential.teacher_id)
    if teacher is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unknown account.",
            headers={"code": "ERR_PASSKEY_FAILED"},
        )

    # The passkey has to belong to the account this sign-in is already for.
    #
    # Without this the two halves could come from different accounts: prove your
    # own password to get a pending token carrying `amr: ["password"]`, then
    # present someone else's passkey, and `advance_sign_in` would run with their
    # teacher and your factor list — a full session as them, on the single factor
    # their authenticator provides. Restarting is the right answer rather than
    # quietly dropping `already`, since a mismatch is either an attack or a stale
    # cookie and neither should silently become a sign-in.
    if pending_subject and pending_subject != str(teacher.id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That passkey belongs to a different account. Start the sign-in again.",
            headers={"code": "ERR_PASSKEY_FAILED"},
        )

    return await advance_sign_in(
        db, request, response, teacher, "passkey", already, flow=flow
    )


@router.get("/credentials", response_model=CredentialListResponse)
async def list_credentials(
    session: PendingSession = Depends(get_pending_teacher),
    db: AsyncSession = Depends(get_db),
) -> CredentialListResponse:
    if session.scope not in _REGISTER_SCOPES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authenticated.",
            headers={"code": "ERR_UNAUTHORIZED"},
        )
    rows = await webauthn_svc.list_credentials(db, session.teacher.id)
    return CredentialListResponse(
        credentials=[
            CredentialSummary(
                credential_id_b64=_b64(row.credential_id),
                nickname=row.nickname,
                supports_prf=row.supports_prf,
                prf_salt_b64=_b64(row.prf_salt),
                created_at=row.created_at,
                last_used_at=row.last_used_at,
            )
            for row in rows
        ]
    )


@router.delete("/credentials/{credential_id_b64}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credential(
    credential_id_b64: str,
    request: Request,
    session: PendingSession = Depends(get_pending_teacher),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Remove a passkey.

    Refused when it would drop the account below two sign-in factors, or below
    its last means of decrypting its own data.
    """
    if session.scope != "full":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A full session is required.",
            headers={"code": "ERR_MFA_REQUIRED"},
        )

    teacher = session.teacher
    remaining = await webauthn_svc.list_credentials(db, teacher.id)
    if len(remaining) <= 1:
        allowed, reason = await auth_policy.may_remove_factor(db, teacher, "passkey")
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=reason or "That factor cannot be removed.",
                headers={"code": "ERR_LAST_FACTOR_PROTECTED"},
            )

    padded = credential_id_b64 + "=" * (-len(credential_id_b64) % 4)
    if not await webauthn_svc.delete_credential(db, teacher.id, base64.urlsafe_b64decode(padded)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Passkey not found.")

    await audit_svc.write(
        db,
        teacher_id=teacher.id,
        teacher_email=teacher.email,
        action="PASSKEY_REMOVED",
        request_ip=request.client.host if request.client else None,
    )
