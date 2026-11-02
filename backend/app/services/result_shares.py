"""Result shares (issue #207, docs/dev/result_sharing.md): store, list, revoke, open and expire students' sealed result PDFs. The only code that reads or writes `result_shares` and the "shares" blob kind."""
from __future__ import annotations

import hashlib
import hmac
import logging
import uuid
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.result_share import ResultShare
from app.schemas.binary import ARGON2_SALT_BYTES, GCM_IV_BYTES, decode_b64
from app.schemas.result_share import ResultShareCreate, ResultShareOut
from app.services import blob_store
from app.services.blob_validation import UploadRejected, check_upload, upload_http_error

logger = logging.getLogger(__name__)

KIND = "shares"
LOOKUP_BYTES = 32


def not_found() -> HTTPException:
    """Unknown, expired, revoked and wrong-link requests answer alike, so a guess learns nothing."""
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Result not found.",
        headers={"code": "ERR_SHARE_NOT_FOUND"},
    )


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def to_out(share: ResultShare) -> ResultShareOut:
    return ResultShareOut(
        id=share.id,
        student_key=share.student_key,
        factor=share.factor,  # type: ignore[arg-type]
        size=share.size,
        created_at=share.created_at,
        expires_at=share.expires_at,
    )


def _forget(db: AsyncSession, shares: Iterable[ResultShare]) -> None:
    for share in shares:
        if share.blob_path is not None:
            blob_store.delete_after_commit(db, share.blob_path)


async def create_or_replace(
    db: AsyncSession, teacher_id: uuid.UUID, exam_id: uuid.UUID, body: ResultShareCreate
) -> ResultShare:
    """Store a student's sealed PDF; an earlier share of the same student is replaced, so their old link stops working."""
    if body.expiry_days not in settings.RESULT_SHARE_EXPIRY_DAYS:
        raise _bad_request(f"expiry_days must be one of {settings.RESULT_SHARE_EXPIRY_DAYS}.")
    if (body.factor == "none") != (body.kdf_salt_b64 is None):
        raise _bad_request("kdf_salt_b64 is required exactly when a code protects the share.")
    salt = (
        decode_b64(body.kdf_salt_b64, "kdf_salt_b64", expected_len=ARGON2_SALT_BYTES)
        if body.kdf_salt_b64 is not None
        else None
    )
    iv = decode_b64(body.iv_b64, "iv_b64", expected_len=GCM_IV_BYTES)
    data = decode_b64(body.ciphertext_b64, "ciphertext_b64")
    try:
        check_upload(data, settings.RESULT_SHARE_MAX_BYTES, "Result PDF")
    except UploadRejected as exc:
        raise upload_http_error(exc) from None

    old = (
        await db.execute(
            select(ResultShare).where(
                ResultShare.exam_id == exam_id,
                (ResultShare.student_key == body.student_key) | (ResultShare.id == body.id),
            )
        )
    ).scalars().all()
    if any(s.id == body.id and s.student_key != body.student_key for s in old):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Share id in use.")
    _forget(db, old)
    for share in old:
        await db.delete(share)
    await db.flush()

    share = ResultShare(
        id=body.id,
        teacher_id=teacher_id,
        exam_id=exam_id,
        student_key=body.student_key,
        lookup_hash=body.lookup_hash,
        factor=body.factor,
        kdf_salt=salt,
        iv=iv,
        size=len(data),
        created_at=datetime.now(UTC),
        expires_at=datetime.now(UTC) + timedelta(days=body.expiry_days),
    )
    if blob_store.writes_to_files():
        ref = await blob_store.put(KIND, str(exam_id), str(body.id), data)
        blob_store.remember_written(db, ref)
        share.blob_path = ref
    else:
        share.ciphertext = data
    db.add(share)
    await db.flush()
    return share


async def list_for_exam(db: AsyncSession, exam_id: uuid.UUID) -> list[ResultShare]:
    now = datetime.now(UTC)
    rows = await db.execute(
        select(ResultShare)
        .where(ResultShare.exam_id == exam_id, ResultShare.expires_at > now)
        .order_by(ResultShare.created_at)
    )
    return list(rows.scalars().all())


async def revoke(db: AsyncSession, exam_id: uuid.UUID, share_ids: Iterable[uuid.UUID] | None) -> int:
    """Delete the given shares of the exam, or all of them (*share_ids* None); returns how many."""
    query = select(ResultShare).where(ResultShare.exam_id == exam_id)
    if share_ids is not None:
        query = query.where(ResultShare.id.in_(list(share_ids)))
    shares = (await db.execute(query)).scalars().all()
    _forget(db, shares)
    for share in shares:
        await db.delete(share)
    return len(shares)


async def revoke_student(db: AsyncSession, exam_id: uuid.UUID, student_key: str) -> None:
    """For deleting a student: their link stops working with them."""
    shares = (
        await db.execute(
            select(ResultShare).where(
                ResultShare.exam_id == exam_id, ResultShare.student_key == student_key
            )
        )
    ).scalars().all()
    _forget(db, shares)
    for share in shares:
        await db.delete(share)


def forget_exams(db: AsyncSession, exam_ids: list[uuid.UUID]) -> None:
    """For deletes that cascade in the DB: drop the exams' share files after the commit."""
    if blob_store.configured():
        for exam_id in exam_ids:
            blob_store.delete_group_after_commit(db, KIND, str(exam_id))


async def drop_exams(db: AsyncSession, exam_ids: list[uuid.UUID]) -> None:
    """Delete the exams' shares outright (an exam delete never captures them: a restored exam must not revive links)."""
    if not exam_ids:
        return
    forget_exams(db, exam_ids)
    await db.execute(delete(ResultShare).where(ResultShare.exam_id.in_(exam_ids)))


async def open_share(db: AsyncSession, share_id: uuid.UUID, lookup_b64: str) -> tuple[ResultShare, bytes]:
    """The share and its ciphertext, if the lookup secret matches and it has not expired; otherwise `not_found`."""
    try:
        lookup = decode_b64(lookup_b64, "lookup_b64", expected_len=LOOKUP_BYTES)
    except HTTPException:
        raise not_found() from None
    share = await db.get(ResultShare, share_id)
    presented = hashlib.sha256(lookup).hexdigest()
    if share is None or not hmac.compare_digest(presented, share.lookup_hash):
        raise not_found()
    if share.expires_at.replace(tzinfo=share.expires_at.tzinfo or UTC) <= datetime.now(UTC):
        raise not_found()
    if share.blob_path is not None:
        data = await blob_store.get(share.blob_path)
    else:
        data = await db.scalar(select(ResultShare.ciphertext).where(ResultShare.id == share.id)) or b""
    if not data:
        raise not_found()
    return share, data


async def purge_expired(db: AsyncSession, now: datetime) -> int:
    """Retention: delete expired shares and their files."""
    expired = (
        await db.execute(select(ResultShare).where(ResultShare.expires_at <= now))
    ).scalars().all()
    _forget(db, expired)
    for share in expired:
        await db.delete(share)
    return len(expired)


async def sweep_orphan_files(db: AsyncSession) -> int:
    """Delete share files no row references (cascaded exam or account deletes, crashes)."""
    if not blob_store.configured():
        return 0
    paths = await db.scalars(select(ResultShare.blob_path).where(ResultShare.blob_path.isnot(None)))
    referenced = {path for path in paths if path is not None}
    try:
        return blob_store.sweep_sync(KIND, referenced)
    except blob_store.BlobStoreUnavailable as exc:
        logger.exception("share sweep skipped: %s", exc.reason)
        return 0
