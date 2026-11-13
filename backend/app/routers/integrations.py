"""Delivery of graded results to students (issue #209): an Artemis relay and result-link e-mail. The Artemis token, files and addresses live only in the request and are never logged or stored; only each student's delivery status is kept, under their pseudonym (issue #221)."""

from __future__ import annotations

import re
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, EmailStr, Field

from app.dependencies import DB, TeachingTeacher
from app.middleware.rate_limit import limiter
from app.services import account_mail, artemis, bounces, result_deliveries
from app.services import email as email_svc
from app.services.blob_validation import check_upload, payload_too_large
from app.services.capabilities import mail_configured, require_result_delivery

router = APIRouter(
    prefix="/integrations",
    tags=["integrations"],
    dependencies=[Depends(require_result_delivery)],
)

_MAX_PDF_BYTES = 10 * 1024 * 1024
_MAX_LINK = 500
_FILENAME_UNSAFE = re.compile(r"[^\w.\- ]")

JWT = Annotated[str, Field(min_length=1, max_length=8192)]
Host = Annotated[str, Field(min_length=1, max_length=253)]
CourseId = Annotated[int, Field(gt=0)]
UserId = Annotated[int, Field(gt=0)]
StudentKey = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]


class ArtemisCourse(BaseModel):
    host: Host
    course_id: CourseId
    jwt: JWT


class ArtemisStudent(BaseModel):
    id: int
    name: str
    login: str | None
    email: str | None


class ArtemisStudents(BaseModel):
    students: list[ArtemisStudent]


class ArtemisMessage(ArtemisCourse):
    user_id: UserId
    content: Annotated[str, Field(min_length=1, max_length=4000)]
    # Both set: the outcome is recorded as this student's delivery status.
    exam_id: uuid.UUID | None = None
    student_key: StudentKey | None = None


class Ok(BaseModel):
    ok: bool = True


class ResultRecipient(BaseModel):
    email: EmailStr
    student_key: StudentKey
    url: str
    expires_at: datetime
    # The key or code, only when the teacher chose to send it along (weaker than a separate factor).
    code: Annotated[str | None, Field(default=None, max_length=16, pattern=r"^[A-Z0-9-]+$")] = None


class ResultMails(BaseModel):
    exam_id: uuid.UUID
    exam_title: Annotated[str, Field(min_length=1, max_length=200)]
    locale: Literal["de", "en"]
    # "review_reply" mails the "your teacher answered your objection" text instead (issue #226).
    kind: Literal["result", "review_reply"] = "result"
    recipients: Annotated[list[ResultRecipient], Field(min_length=1, max_length=100)]


class ResultMailsSent(BaseModel):
    sent: int
    failed: list[int]


@router.post("/artemis/students")
@limiter.limit("60/hour")
async def artemis_students(request: Request, body: ArtemisCourse) -> ArtemisStudents:
    """The students of an Artemis course, for matching them to exam students."""
    students = await artemis.list_students(body.host, body.course_id, body.jwt)
    return ArtemisStudents(students=[ArtemisStudent(**s) for s in students])


@router.post("/artemis/messages")
@limiter.limit("600/hour")
async def artemis_message(
    request: Request, body: ArtemisMessage, teacher: TeachingTeacher, db: DB
) -> Ok:
    """Send a text message to one student in a one-to-one Artemis chat."""
    await _recorded(
        db,
        teacher,
        body.exam_id,
        body.student_key,
        lambda: artemis.send_message(
            body.host, body.course_id, body.jwt, body.user_id, body.content
        ),
    )
    return Ok()


async def _recorded(
    db: DB,
    teacher: TeachingTeacher,
    exam_id: uuid.UUID | None,
    student_key: str | None,
    send: Callable[[], Awaitable[None]],
) -> None:
    """Run an Artemis send and keep its outcome as the student's status; the error still reaches the client."""
    if exam_id is None or student_key is None:
        await send()
        return
    await result_deliveries.require_own_exam(db, teacher.id, exam_id)
    try:
        await send()
    except HTTPException as exc:
        await result_deliveries.record(
            db, teacher.id, exam_id, student_key, "artemis", "failed", detail=str(exc.detail)
        )
        # get_db rolls back on errors, so the failure is committed before it is raised.
        await db.commit()
        raise
    await result_deliveries.record(db, teacher.id, exam_id, student_key, "artemis", "sent")


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, detail, headers={"code": "ERR_BAD_REQUEST"})


def _safe_filename(name: str | None) -> str:
    base = (name or "").replace("\\", "/").rsplit("/", 1)[-1]
    clean = _FILENAME_UNSAFE.sub("_", base).strip(" .")[:100]
    return clean or "result.pdf"


@router.post("/artemis/files")
@limiter.limit("600/hour")
async def artemis_file(
    request: Request,
    host: Annotated[str, Form(min_length=1, max_length=253)],
    course_id: Annotated[int, Form(gt=0)],
    jwt: Annotated[str, Form(min_length=1, max_length=8192)],
    user_id: Annotated[int, Form(gt=0)],
    file: Annotated[UploadFile, File()],
    teacher: TeachingTeacher,
    db: DB,
    message: Annotated[str | None, Form(max_length=4000)] = None,
    exam_id: Annotated[uuid.UUID | None, Form()] = None,
    student_key: Annotated[str | None, Form(pattern=r"^[0-9a-f]{64}$")] = None,
) -> Ok:
    """Upload a graded PDF into a one-to-one Artemis chat. Held in memory only, never stored."""
    artemis.check_host(host)
    if file.content_type != "application/pdf":
        raise _bad_request("Only PDF files can be sent.")
    data = await file.read(_MAX_PDF_BYTES + 1)
    if len(data) > _MAX_PDF_BYTES:
        raise payload_too_large("The file is larger than 10 MB.")
    check_upload(data, _MAX_PDF_BYTES, "The file")
    if not data.startswith(b"%PDF"):
        raise _bad_request("The file is not a PDF.")
    await _recorded(
        db,
        teacher,
        exam_id,
        student_key,
        lambda: artemis.send_file(
            host, course_id, jwt, user_id, _safe_filename(file.filename), data, message or None
        ),
    )
    return Ok()


def _link_invalid() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail="The result link is not a link into this installation.",
        headers={"code": "ERR_RESULT_LINK_INVALID"},
    )


@router.post("/mail/results")
@limiter.limit("20/hour")
async def mail_results(
    request: Request, body: ResultMails, teacher: TeachingTeacher, db: DB
) -> ResultMailsSent:
    """Mail each student the link to their sealed result. The key or code is never part of the mail."""
    prefix = account_mail.frontend_link("/result#")
    for recipient in body.recipients:
        url = recipient.url
        if (
            not url.startswith(prefix)
            or len(url) > _MAX_LINK
            or "?" in url
            or any(c.isspace() for c in url)
        ):
            raise _link_invalid()
    if not mail_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="E-mail delivery is not configured on this server.",
            headers={"code": "ERR_MAIL_UNAVAILABLE"},
        )
    await result_deliveries.require_own_exam(db, teacher.id, body.exam_id)
    failed: list[int] = []
    for index, recipient in enumerate(body.recipients):
        token = result_deliveries.new_token()
        mail = account_mail.result_link_mail(
            recipient.email,
            body.exam_title,
            recipient.url,
            recipient.expires_at,
            None,
            body.locale,
            code=recipient.code,
            kind=body.kind,
            envelope=email_svc.Envelope(
                message_id=bounces.result_message_id(token),
                sender=email_svc.result_sender(),
            ),
        )
        sent = await account_mail.send(mail)
        if not sent:
            failed.append(index)
        await result_deliveries.record(
            db,
            teacher.id,
            body.exam_id,
            recipient.student_key,
            "email",
            "sent" if sent else "failed",
            # The refusal's text can contain the address, so only that it failed is kept.
            detail=None if sent else "SMTP",
            mail_token=token if sent else None,
        )
    return ResultMailsSent(sent=len(body.recipients) - len(failed), failed=failed)
