"""Result shares (issue #207, docs/dev/result_sharing.md): store, list, revoke, open and expire students' sealed result PDFs. The only code that reads or writes `result_shares` and the "shares" blob kind."""
from __future__ import annotations

import base64
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
from app.models.result_share import ResultShare, ResultShareReview
from app.schemas.binary import ARGON2_SALT_BYTES, GCM_IV_BYTES, decode_b64
from app.schemas.result_share import (
    ResultShareCreate,
    ResultShareOut,
    ReviewListItem,
    ReviewOut,
)
from app.services import blob_store
from app.services.blob_validation import UploadRejected, check_upload, upload_http_error

logger = logging.getLogger(__name__)

KIND = "shares"
LOOKUP_BYTES = 32
# A sealed objection or reply (500 characters per item, base64 in a 64 KB body).
REVIEW_MAX_BYTES = 45_000
WRAPPED_KEY_MAX_BYTES = 256


def not_found() -> HTTPException:
    """Unknown, expired, revoked and wrong-link requests answer alike, so a guess learns nothing."""
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Result not found.",
        headers={"code": "ERR_SHARE_NOT_FOUND"},
    )


def _conflict(detail: str, code: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail, headers={"code": code})


def _aware(moment: datetime) -> datetime:
    """SQLite hands timestamps back naive; they are UTC."""
    return moment.replace(tzinfo=moment.tzinfo or UTC)


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def to_out(share: ResultShare, review: ResultShareReview | None = None) -> ResultShareOut:
    return ResultShareOut(
        id=share.id,
        student_key=share.student_key,
        factor=share.factor,  # type: ignore[arg-type]
        size=share.size,
        created_at=share.created_at,
        expires_at=share.expires_at,
        updatable=share.wrapped_key is not None,
        content_updated_at=share.content_updated_at,
        review_until=share.review_until,
        review_submitted_at=review.submitted_at if review else None,
        review_opened_at=review.opened_at if review else None,
        review_replied_at=review.replied_at if review else None,
    )


def review_out(review: ResultShareReview) -> ReviewOut:
    return ReviewOut(
        objection_iv_b64=_b64(review.objection_iv),
        objection_ct_b64=_b64(review.objection_ct),
        submitted_at=review.submitted_at,
        opened_at=review.opened_at,
        reply_iv_b64=_b64(review.reply_iv),
        reply_ct_b64=_b64(review.reply_ct),
        replied_at=review.replied_at,
    )


def _b64(value: bytes | None) -> str | None:
    return base64.b64encode(value).decode() if value else None


async def _forget(db: AsyncSession, shares: Iterable[ResultShare]) -> None:
    """Drop the shares' files and reviews (the DB cascade does not run everywhere, e.g. SQLite)."""
    ids = []
    for share in shares:
        ids.append(share.id)
        if share.blob_path is not None:
            blob_store.delete_after_commit(db, share.blob_path)
    if ids:
        await db.execute(delete(ResultShareReview).where(ResultShareReview.share_id.in_(ids)))


async def _store_ciphertext(db: AsyncSession, share: ResultShare, data: bytes) -> None:
    """Put *data* into whichever backend is active; a replaced file is deleted after the commit."""
    if blob_store.writes_to_files():
        ref = await blob_store.put(KIND, str(share.exam_id), str(share.id), data)
        blob_store.remember_written(db, ref)
        if share.blob_path is not None:
            blob_store.delete_after_commit(db, share.blob_path)
        share.blob_path = ref
        share.ciphertext = None
    else:
        if share.blob_path is not None:
            blob_store.delete_after_commit(db, share.blob_path)
        share.blob_path = None
        share.ciphertext = data


def _checked_pdf(ciphertext_b64: str) -> bytes:
    data = decode_b64(ciphertext_b64, "ciphertext_b64")
    try:
        check_upload(data, settings.RESULT_SHARE_MAX_BYTES, "Result PDF")
    except UploadRejected as exc:
        raise upload_http_error(exc) from None
    return data


def _decode_wrapped_key(value: str | None) -> bytes | None:
    if value is None:
        return None
    wrapped = decode_b64(value, "wrapped_key_b64")
    if not wrapped or len(wrapped) > WRAPPED_KEY_MAX_BYTES:
        raise _bad_request("wrapped_key_b64 has an invalid size.")
    return wrapped


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
    data = _checked_pdf(body.ciphertext_b64)
    wrapped = _decode_wrapped_key(body.wrapped_key_b64)
    now = datetime.now(UTC)
    expires_at = now + timedelta(days=body.expiry_days)
    review_until = _aware(body.review_until) if body.review_until is not None else None
    if review_until is not None and review_until > expires_at:
        raise _bad_request("review_until must not be later than the link's expiry.")

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
    await _forget(db, old)
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
        created_at=now,
        expires_at=expires_at,
        wrapped_key=wrapped,
        review_until=review_until,
    )
    await _store_ciphertext(db, share, data)
    db.add(share)
    await db.flush()
    return share


async def list_for_exam(
    db: AsyncSession, exam_id: uuid.UUID
) -> list[tuple[ResultShare, ResultShareReview | None]]:
    """The exam's live shares, each with its review state."""
    now = datetime.now(UTC)
    rows = await db.execute(
        select(ResultShare, ResultShareReview)
        .outerjoin(ResultShareReview, ResultShareReview.share_id == ResultShare.id)
        .where(ResultShare.exam_id == exam_id, ResultShare.expires_at > now)
        .order_by(ResultShare.created_at)
    )
    return [(share, review) for share, review in rows.all()]


async def revoke(db: AsyncSession, exam_id: uuid.UUID, share_ids: Iterable[uuid.UUID] | None) -> int:
    """Delete the given shares of the exam, or all of them (*share_ids* None); returns how many."""
    query = select(ResultShare).where(ResultShare.exam_id == exam_id)
    if share_ids is not None:
        query = query.where(ResultShare.id.in_(list(share_ids)))
    shares = (await db.execute(query)).scalars().all()
    await _forget(db, shares)
    for share in shares:
        await db.delete(share)
    return len(shares)


async def revoke_student(db: AsyncSession, exam_id: uuid.UUID, student_key: str) -> int:
    """For deleting a student: their link stops working with them; returns how many."""
    shares = (
        await db.execute(
            select(ResultShare).where(
                ResultShare.exam_id == exam_id, ResultShare.student_key == student_key
            )
        )
    ).scalars().all()
    await _forget(db, shares)
    for share in shares:
        await db.delete(share)
    return len(shares)


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
    await db.execute(delete(ResultShareReview).where(ResultShareReview.exam_id.in_(exam_ids)))
    await db.execute(delete(ResultShare).where(ResultShare.exam_id.in_(exam_ids)))


async def _by_lookup(db: AsyncSession, share_id: uuid.UUID, lookup_b64: str) -> ResultShare:
    """The unexpired share whose lookup secret matches; otherwise `not_found`."""
    try:
        lookup = decode_b64(lookup_b64, "lookup_b64", expected_len=LOOKUP_BYTES)
    except HTTPException:
        raise not_found() from None
    share = await db.get(ResultShare, share_id)
    presented = hashlib.sha256(lookup).hexdigest()
    if share is None or not hmac.compare_digest(presented, share.lookup_hash):
        raise not_found()
    if _aware(share.expires_at) <= datetime.now(UTC):
        raise not_found()
    return share


async def open_share(
    db: AsyncSession, share_id: uuid.UUID, lookup_b64: str
) -> tuple[ResultShare, bytes, ResultShareReview | None]:
    """The share, its ciphertext and review, if the lookup secret matches and it has not expired; otherwise `not_found`."""
    share = await _by_lookup(db, share_id, lookup_b64)
    if share.blob_path is not None:
        data = await blob_store.get(share.blob_path)
    else:
        data = await db.scalar(select(ResultShare.ciphertext).where(ResultShare.id == share.id)) or b""
    if not data:
        raise not_found()
    return share, data, await db.get(ResultShareReview, share.id)


async def purge_expired(db: AsyncSession, now: datetime) -> int:
    """Retention: delete expired shares and their files."""
    expired = (
        await db.execute(select(ResultShare).where(ResultShare.expires_at <= now))
    ).scalars().all()
    await _forget(db, expired)
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
