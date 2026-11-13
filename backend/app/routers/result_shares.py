"""Result sharing with students (issue #207): the teacher's endpoints under /exams/{id}/shares and /exams/{id}/deliveries (delivery status, issue #221) and the public, session-less open endpoint under /shares."""
from __future__ import annotations

import base64
import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_exam_for_teacher, get_teaching_teacher
from app.middleware.rate_limit import limiter
from app.models.exam import Exam
from app.models.teacher import Teacher
from app.schemas.result_share import (
    ResultDeliveryOut,
    ResultShareContent,
    ResultShareCreate,
    ResultShareOpen,
    ResultShareOut,
    ReviewListItem,
    ReviewSubmit,
    SealedPayload,
)
from app.services import account_mail, bounces, result_deliveries, result_shares
from app.services import audit as audit_svc
from app.services.capabilities import mail_configured

router = APIRouter(
    prefix="/exams/{exam_id}/shares",
    tags=["result-shares"],
    dependencies=[Depends(get_teaching_teacher)],
)
public_router = APIRouter(prefix="/shares", tags=["result-shares"])


def _b64(value: bytes) -> str:
    return base64.b64encode(value).decode()


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_result_share(
    body: ResultShareCreate,
    request: Request,
    exam: Exam = Depends(get_exam_for_teacher),
    teacher: Teacher = Depends(get_teaching_teacher),
    db: AsyncSession = Depends(get_db),
) -> ResultShareOut:
    """Store one student's sealed result PDF; replaces their earlier share. Allowed in every storage mode: the server can never open it."""
    share = await result_shares.create_or_replace(db, teacher.id, exam.id, body)
    await audit_svc.log(db, request, teacher, "RESULT_SHARED", exam.id)
    return result_shares.to_out(share)


@router.get("")
async def list_result_shares(
    exam: Exam = Depends(get_exam_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> list[ResultShareOut]:
    """The exam's live shares (expired ones are gone or about to be)."""
    return [result_shares.to_out(s, r) for s, r in await result_shares.list_for_exam(db, exam.id)]


@router.put("/{share_id}/content", status_code=status.HTTP_204_NO_CONTENT)
async def update_result_share_content(
    share_id: uuid.UUID,
    body: SealedPayload,
    exam: Exam = Depends(get_exam_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Re-seal the share's PDF under the same link (issue #226); 409 `ERR_SHARE_NOT_UPDATABLE` for a share made without a wrapped key."""
    await result_shares.update_content(db, exam.id, share_id, body.iv_b64, body.ciphertext_b64)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{share_id}/review/open", status_code=status.HTTP_204_NO_CONTENT)
async def open_result_share_review(
    share_id: uuid.UUID,
    exam: Exam = Depends(get_exam_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """The teacher opened the objection: the student can no longer change or withdraw it."""
    await result_shares.mark_opened(db, exam.id, share_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{share_id}/review/reply", status_code=status.HTTP_204_NO_CONTENT)
async def reply_to_result_share_review(
    share_id: uuid.UUID,
    body: SealedPayload,
    request: Request,
    exam: Exam = Depends(get_exam_for_teacher),
    teacher: Teacher = Depends(get_teaching_teacher),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Store the teacher's sealed reply for the student's page."""
    await result_shares.store_reply(db, exam.id, share_id, body.iv_b64, body.ciphertext_b64)
    await audit_svc.log(db, request, teacher, "REVIEW_REPLIED", exam.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_result_share(
    share_id: uuid.UUID,
    request: Request,
    exam: Exam = Depends(get_exam_for_teacher),
    teacher: Teacher = Depends(get_teaching_teacher),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Revoke one link; its ciphertext is deleted."""
    if not await result_shares.revoke(db, exam.id, [share_id]):
        raise result_shares.not_found()
    await audit_svc.log(db, request, teacher, "RESULT_SHARE_REVOKED", exam.id)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_all_result_shares(
    request: Request,
    exam: Exam = Depends(get_exam_for_teacher),
    teacher: Teacher = Depends(get_teaching_teacher),
    db: AsyncSession = Depends(get_db),
    student_key: Annotated[
        str | None,
        Query(pattern=r"^[0-9a-f]{64}$", description="Only this student's link (a deleted student)."),
    ] = None,
) -> None:
    """Revoke every link of the exam, or only one student's."""
    if student_key is not None:
        revoked = await result_shares.revoke_student(db, exam.id, student_key)
    else:
        revoked = await result_shares.revoke(db, exam.id, None)
    if revoked:
        await audit_svc.log(db, request, teacher, "RESULT_SHARE_REVOKED", exam.id)


@public_router.post("/{share_id}/open")
@limiter.limit("30/minute")
async def open_result_share(
    share_id: uuid.UUID,
    body: ResultShareOpen,
    request: Request,  # required by slowapi
    db: AsyncSession = Depends(get_db),
) -> ResultShareContent:
    """Public, no session: the ciphertext of a student's result, for the lookup secret their link derives. Decryption happens only in the student's browser."""
    share, data, review = await result_shares.open_share(db, share_id, body.lookup_b64)
    return ResultShareContent(
        factor=share.factor,  # type: ignore[arg-type]
        kdf_salt_b64=_b64(share.kdf_salt) if share.kdf_salt is not None else None,
        iv_b64=_b64(share.iv),
        ciphertext_b64=_b64(data),
        expires_at=share.expires_at,
        content_updated_at=share.content_updated_at,
        review_until=share.review_until,
        review=result_shares.review_out(review) if review is not None else None,
    )


@public_router.post("/{share_id}/review", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
async def submit_result_share_review(
    share_id: uuid.UUID,
    body: ReviewSubmit,
    request: Request,  # required by slowapi
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Public, no session: create or replace the student's sealed objection until the teacher opens it or the deadline passes."""
    share = await result_shares.submit_objection(
        db, share_id, body.lookup_b64, body.iv_b64, body.ciphertext_b64
    )
    teacher = await db.get(Teacher, share.teacher_id)
    exam = await db.get(Exam, share.exam_id)
    if teacher is not None and exam is not None:
        await audit_svc.log(db, request, teacher, "REVIEW_SUBMITTED", exam.id)
        if mail_configured() and teacher.review_mail is not False:
            mail = account_mail.review_notice_mail(
                teacher.email, exam.title, account_mail.frontend_link(f"/exam/{exam.id}/results/share")
            )
            background_tasks.add_task(account_mail.send_all, [mail])
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@public_router.post("/{share_id}/review/withdraw", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("10/minute")
async def withdraw_result_share_review(
    share_id: uuid.UUID,
    body: ResultShareOpen,
    request: Request,  # required by slowapi
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Public, no session: delete the student's objection while it is still open."""
    await result_shares.withdraw_objection(db, share_id, body.lookup_b64)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


reviews_router = APIRouter(
    prefix="/exams/{exam_id}/reviews",
    tags=["result-shares"],
    dependencies=[Depends(get_teaching_teacher)],
)


@reviews_router.get("")
async def list_result_share_reviews(
    exam: Exam = Depends(get_exam_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> list[ReviewListItem]:
    """Every objection and reply of the exam, still sealed; the student appears only as the pseudonym."""
    return await result_shares.list_reviews(db, exam.id)


deliveries_router = APIRouter(
    prefix="/exams/{exam_id}/deliveries",
    tags=["result-shares"],
    dependencies=[Depends(get_teaching_teacher)],
)


@deliveries_router.get("")
async def list_result_deliveries(
    exam: Exam = Depends(get_exam_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> list[ResultDeliveryOut]:
    """Each student's delivery status for result mails and Artemis messages (issue #221)."""
    return [result_deliveries.to_out(d) for d in await result_deliveries.list_for_exam(db, exam.id)]


@deliveries_router.post("/check")
@limiter.limit("30/minute")
async def check_result_deliveries(
    request: Request,  # required by slowapi
    exam: Exam = Depends(get_exam_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> list[ResultDeliveryOut]:
    """Read the bounce mailbox now (while the share dialog waits), then list the statuses."""
    await bounces.poll_bounces(db)
    return [result_deliveries.to_out(d) for d in await result_deliveries.list_for_exam(db, exam.id)]


@deliveries_router.post("/close", status_code=status.HTTP_204_NO_CONTENT)
async def close_result_deliveries(
    exam: Exam = Depends(get_exam_for_teacher),
    teacher: Teacher = Depends(get_teaching_teacher),
    db: AsyncSession = Depends(get_db),
) -> None:
    """The share dialog stopped waiting: bounces from now on are forwarded to the teacher by mail."""
    await result_deliveries.close_window(db, exam.id, teacher.id)
