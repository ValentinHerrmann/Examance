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
from app.models.result_share import ResultShare, ResultShareReview
from app.schemas.binary import ARGON2_SALT_BYTES, GCM_IV_BYTES, decode_b64, encode_b64_or_none
from app.schemas.result_share import (
    ResultShareCreate,
    ResultShareOut,
    ReviewListItem,
    ReviewOut,
    ReviewReseal,
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
        wrapped_key_b64=encode_b64_or_none(share.wrapped_key),
        content_updated_at=share.content_updated_at,
        review_until=share.review_until,
        review_submitted_at=review.submitted_at if review else None,
        review_opened_at=review.opened_at if review else None,
        review_replied_at=review.replied_at if review else None,
        review_reply_complete=review.reply_complete if review else None,
    )


def review_out(review: ResultShareReview) -> ReviewOut:
    return ReviewOut(
        objection_iv_b64=encode_b64_or_none(review.objection_iv),
        objection_ct_b64=encode_b64_or_none(review.objection_ct),
        submitted_at=review.submitted_at,
        opened_at=review.opened_at,
        reply_iv_b64=encode_b64_or_none(review.reply_iv),
        reply_ct_b64=encode_b64_or_none(review.reply_ct),
        replied_at=review.replied_at,
        reply_complete=review.reply_complete,
    )



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
    """Store a student's sealed PDF. Sent again under the student's own share id, the share is updated in place, so the link stays (issue #310); any other share of the student is replaced and its link stops working."""
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
    review_until = _aware(body.review_until) if body.review_until is not None else None

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
    kept = next((s for s in old if s.id == body.id), None)
    if kept is not None and not hmac.compare_digest(kept.lookup_hash, body.lookup_hash):
        raise _conflict("The link of this share cannot change; revoke it for a new one.", "ERR_SHARE_LINK_MISMATCH")
    expires_at = (
        _aware(kept.expires_at) if kept is not None and body.keep_expiry else now + timedelta(days=body.expiry_days)
    )
    if review_until is not None and review_until > expires_at:
        raise _bad_request("review_until must not be later than the link's expiry.")
    if kept is not None:
        await _check_review_unchanged(db, kept.id, body.review or ReviewReseal())
    replaced = [s for s in old if s is not kept]
    await _forget(db, replaced)
    for share in replaced:
        await db.delete(share)
    await db.flush()

    if kept is not None:
        kept.factor = body.factor
        kept.kdf_salt = salt
        kept.expires_at = expires_at
        kept.wrapped_key = wrapped
        kept.review_until = review_until
        await _update_in_place(db, kept, iv, data, body.review)
        return kept

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


async def _update_in_place(
    db: AsyncSession, kept: ResultShare, iv: bytes, data: bytes, reseal: ReviewReseal | None
) -> None:
    """Store the re-sealed PDF of a kept link (issue #310): id, lookup and creation date stay, the thread is re-sealed."""
    await _store_ciphertext(db, kept, data)
    kept.iv = iv
    kept.size = len(data)
    kept.content_updated_at = datetime.now(UTC)
    if reseal is not None:
        await _reseal_review(db, kept.id, reseal)
    await db.flush()


def _same_moment(stored: datetime | None, seen: datetime | None) -> bool:
    if stored is None or seen is None:
        return stored is seen
    return _aware(stored) == _aware(seen)


async def _check_review_unchanged(db: AsyncSession, share_id: uuid.UUID, seen: ReviewReseal) -> None:
    """A kept link changes its content key, so its thread must be exactly the one the client re-sealed: an objection sent meanwhile would become unreadable (409)."""
    review = await db.get(ResultShareReview, share_id)
    if review is None:
        return
    unchanged = (
        _same_moment(review.submitted_at, seen.submitted_at)
        and _same_moment(review.replied_at, seen.replied_at)
        and (review.objection_ct is None or seen.objection_ct_b64 is not None)
        and (review.reply_ct is None or seen.reply_ct_b64 is not None)
    )
    if not unchanged:
        raise _conflict("The objection changed during the send; send again.", "ERR_SHARE_REVIEW_CHANGED")


async def _reseal_review(db: AsyncSession, share_id: uuid.UUID, reseal: ReviewReseal) -> None:
    """Replace the thread's ciphertexts with the ones sealed under the share's new key; its timestamps stay."""
    review = await db.get(ResultShareReview, share_id)
    if review is None:
        return
    if reseal.objection_iv_b64 is not None and reseal.objection_ct_b64 is not None:
        review.objection_iv, review.objection_ct = _sealed(reseal.objection_iv_b64, reseal.objection_ct_b64)
    if reseal.reply_iv_b64 is not None and reseal.reply_ct_b64 is not None:
        review.reply_iv, review.reply_ct = _sealed(reseal.reply_iv_b64, reseal.reply_ct_b64)


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


# --- Objections and replies (issue #226, docs/dev/grading_review.md) ---------------------------


async def _own(db: AsyncSession, exam_id: uuid.UUID, share_id: uuid.UUID) -> ResultShare:
    share = await db.get(ResultShare, share_id)
    if share is None or share.exam_id != exam_id:
        raise not_found()
    return share


def _sealed(iv_b64: str, ciphertext_b64: str) -> tuple[bytes, bytes]:
    iv = decode_b64(iv_b64, "iv_b64", expected_len=GCM_IV_BYTES)
    data = decode_b64(ciphertext_b64, "ciphertext_b64")
    try:
        check_upload(data, REVIEW_MAX_BYTES, "Review")
    except UploadRejected as exc:
        raise upload_http_error(exc) from None
    return iv, data


async def update_content(
    db: AsyncSession, exam_id: uuid.UUID, share_id: uuid.UUID, iv_b64: str, ciphertext_b64: str
) -> ResultShare:
    """Re-seal the share's PDF in place: link, lookup, factor and salt stay. Only shares with a wrapped key qualify."""
    share = await _own(db, exam_id, share_id)
    if share.wrapped_key is None:
        raise _conflict("This share was made before updates existed; share it again.", "ERR_SHARE_NOT_UPDATABLE")
    iv = decode_b64(iv_b64, "iv_b64", expected_len=GCM_IV_BYTES)
    data = _checked_pdf(ciphertext_b64)
    await _store_ciphertext(db, share, data)
    share.iv = iv
    share.size = len(data)
    share.content_updated_at = datetime.now(UTC)
    await db.flush()
    return share


def _review_closed() -> HTTPException:
    return _conflict("Objections are closed for this result.", "ERR_REVIEW_CLOSED")


async def _open_for_objection(
    db: AsyncSession, share_id: uuid.UUID, lookup_b64: str
) -> tuple[ResultShare, ResultShareReview | None]:
    """The share if objections are enabled and still open (404 when disabled, 409 once opened or past the deadline)."""
    share = await _by_lookup(db, share_id, lookup_b64)
    if share.review_until is None:
        raise not_found()
    review = await db.get(ResultShareReview, share.id)
    if _aware(share.review_until) <= datetime.now(UTC) or (review is not None and review.opened_at is not None):
        raise _review_closed()
    return share, review


async def submit_objection(
    db: AsyncSession, share_id: uuid.UUID, lookup_b64: str, iv_b64: str, ciphertext_b64: str
) -> ResultShare:
    """Create or replace the student's objection until the teacher opens it or the deadline passes."""
    share, review = await _open_for_objection(db, share_id, lookup_b64)
    iv, data = _sealed(iv_b64, ciphertext_b64)
    if review is None:
        review = ResultShareReview(
            share_id=share.id,
            teacher_id=share.teacher_id,
            exam_id=share.exam_id,
            student_key=share.student_key,
        )
        db.add(review)
    review.objection_iv = iv
    review.objection_ct = data
    review.submitted_at = datetime.now(UTC)
    await db.flush()
    return share


async def withdraw_objection(db: AsyncSession, share_id: uuid.UUID, lookup_b64: str) -> None:
    """Delete the objection while it is still open; withdrawing none is a no-op."""
    _, review = await _open_for_objection(db, share_id, lookup_b64)
    if review is not None:
        await db.delete(review)
        await db.flush()


async def mark_opened(db: AsyncSession, exam_id: uuid.UUID, share_id: uuid.UUID) -> None:
    """The teacher read the objection: it is locked for the student. Without an objection there is nothing to lock."""
    share = await _own(db, exam_id, share_id)
    review = await db.get(ResultShareReview, share.id)
    if review is not None and review.submitted_at is not None and review.opened_at is None:
        review.opened_at = datetime.now(UTC)
        await db.flush()


async def store_reply(
    db: AsyncSession,
    exam_id: uuid.UUID,
    share_id: uuid.UUID,
    iv_b64: str,
    ciphertext_b64: str,
    complete: bool = True,
) -> ResultShareReview:
    """Store the teacher's sealed reply; replying also closes the thread for the student, *complete* only marks whether every objected exercise is answered."""
    share = await _own(db, exam_id, share_id)
    iv, data = _sealed(iv_b64, ciphertext_b64)
    review = await db.get(ResultShareReview, share.id)
    now = datetime.now(UTC)
    if review is None:
        review = ResultShareReview(
            share_id=share.id,
            teacher_id=share.teacher_id,
            exam_id=share.exam_id,
            student_key=share.student_key,
        )
        db.add(review)
    review.reply_iv = iv
    review.reply_ct = data
    review.replied_at = now
    review.reply_complete = complete
    review.opened_at = review.opened_at or now
    await db.flush()
    return review


async def list_reviews(db: AsyncSession, exam_id: uuid.UUID) -> list[ReviewListItem]:
    """Every review of the exam's live shares, newest objection last."""
    now = datetime.now(UTC)
    rows = await db.scalars(
        select(ResultShareReview)
        .join(ResultShare, ResultShare.id == ResultShareReview.share_id)
        .where(ResultShareReview.exam_id == exam_id, ResultShare.expires_at > now)
        .order_by(ResultShareReview.submitted_at)
    )
    return [
        ReviewListItem(**review_out(r).model_dump(), share_id=r.share_id, student_key=r.student_key)
        for r in rows
    ]
