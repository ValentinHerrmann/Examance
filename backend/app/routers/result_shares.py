"""Result sharing with students (issue #207): the teacher's endpoints under /exams/{id}/shares and the public, session-less open endpoint under /shares."""
from __future__ import annotations

import base64
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_exam_for_teacher, get_teaching_teacher
from app.middleware.rate_limit import limiter
from app.models.exam import Exam
from app.models.teacher import Teacher
from app.schemas.result_share import (
    ResultShareContent,
    ResultShareCreate,
    ResultShareOpen,
    ResultShareOut,
)
from app.services import audit as audit_svc
from app.services import result_shares

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
    return [result_shares.to_out(s) for s in await result_shares.list_for_exam(db, exam.id)]


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
    share, data = await result_shares.open_share(db, share_id, body.lookup_b64)
    return ResultShareContent(
        factor=share.factor,  # type: ignore[arg-type]
        kdf_salt_b64=_b64(share.kdf_salt) if share.kdf_salt is not None else None,
        iv_b64=_b64(share.iv),
        ciphertext_b64=_b64(data),
        expires_at=share.expires_at,
    )
