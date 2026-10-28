"""Self-registration and self-service account deletion by mailed link — /api/v1/auth/*"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_not_frozen
from app.middleware.rate_limit import limiter
from app.schemas.auth import (
    AccountDeletionPreview,
    AccountDeletionTokenRequest,
    RegisterCompleteRequest,
    RegisterCompleteResponse,
    RegisterRequest,
)
from app.services import account_deletion, account_mail
from app.services import audit as audit_svc
from app.services import registration as registration_svc

router = APIRouter()


@router.post("/register", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("20/hour")
async def register(
    body: RegisterRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Ask for an account: mails a verification link to the address; nothing is created until used.

    Answers the same whether or not the address already has an account (nothing is mailed then),
    and the mail goes out after the response so timing does not tell either."""
    email = registration_svc.normalize_email(body.email)
    try:
        mail = await registration_svc.request_registration(db, email)
        await db.commit()
    except IntegrityError:
        # A concurrent request for the same address won the insert; its mail covers this one.
        await db.rollback()
        mail = None
    if mail is not None:
        background_tasks.add_task(account_mail.send_all, [mail])
    return {
        "message": (
            "If this address can be registered, a confirmation link has been sent to it."
        )
    }


@router.post("/register/complete", response_model=RegisterCompleteResponse)
@limiter.limit("20/hour")
async def complete_registration(
    body: RegisterCompleteRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> RegisterCompleteResponse:
    """Verify the address with the mailed token and create the account with the chosen password.

    An address on the admin's always-allowed list is approved at once, any other account waits
    for an admin (notified). Neither issues a session: the registrant signs in and enrolls then."""
    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="This confirmation link is invalid or has expired. Register again.",
        headers={"code": "ERR_INVALID_REGISTRATION_TOKEN"},
    )
    try:
        teacher = await registration_svc.complete_registration(
            db, body.token, body.new_password, body.note
        )
        approved = teacher.approved_at is not None
        await audit_svc.log(db, request, teacher, "USER_REGISTERED")
        if approved:
            # The system approves, not the registrant: the actor differs from `teacher`.
            await audit_svc.write(
                db,
                teacher_id=teacher.id,
                teacher_email="system:allowed-domain",
                action="USER_APPROVED",
                target_id=str(teacher.id),
                request_ip=audit_svc.client_ip(request),
            )
        notices = [] if approved else await registration_svc.admin_notices(db, teacher)
        await db.commit()
    except (registration_svc.RegistrationTokenError, IntegrityError):
        await db.rollback()
        raise invalid from None

    if notices:
        background_tasks.add_task(account_mail.send_all, notices)
    return RegisterCompleteResponse(status="approved" if approved else "pending")


@router.post("/account-deletion/preview", response_model=AccountDeletionPreview)
@limiter.limit("20/hour")
async def preview_account_deletion(
    body: AccountDeletionTokenRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> AccountDeletionPreview:
    """
    What the mailed self-deletion link would delete, for the confirmation page. Deletes nothing:
    a mail scanner that opens the link must not delete the account.
    """
    deletion, teacher = await account_deletion.find_deletion_request(db, body.token)
    return AccountDeletionPreview(
        email=teacher.email,
        keep_exercises=deletion.keep_exercises,
        expires_at=deletion.expires_at,
    )


@router.post(
    "/account-deletion/confirm",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_not_frozen)],
)
@limiter.limit("20/hour")
async def confirm_account_deletion(
    body: AccountDeletionTokenRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """GDPR Art. 17: delete the account behind the mailed single-use link (last admin refused).

    No session needed (the link proves the mailbox); exercises stay ownerless if the holder asked.
    Cookies are left alone (they may belong to another account; this one's tokens die with it)."""
    deletion, teacher = await account_deletion.claim_deletion_request(db, body.token)
    await account_deletion.ensure_not_last_admin(db, teacher)
    result = await account_deletion.delete_account(
        db,
        teacher,
        actor=teacher,
        keep_exercises=deletion.keep_exercises,
        request_ip=audit_svc.client_ip(request),
    )
    return {
        "status": "ok",
        "account_deleted": True,
        "kept_exercises": deletion.keep_exercises,
        "purged_student_identities": result.purged_student_identities,
        "purged_submissions": result.purged_submissions,
        "retention_until": result.retention_until.isoformat(),
    }
