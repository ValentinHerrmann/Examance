"""Per-exam pseudonym versions (issue #177): the write guard and the rename that moves an exam from SHA-256 to the keyed HMAC. The server never sees a raw pseudonym or the key; the client sends old/new pairs."""
from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exam import Exam
from app.models.scan_submission import ScanSubmission
from app.models.student_identity import StudentIdentity
from app.schemas.exam import PseudonymRekey, PseudonymRekeyResult
from app.services.tokens import rowcount


async def require_pseudonym_version(db: AsyncSession, exam_id: uuid.UUID, version: int) -> None:
    """Refuses a student or submission write keyed differently from the exam's rows. 422, not 409: the offline queue counts a 409 as applied and would drop the write. The share lock keeps a rekey from renaming the exam under this write."""
    current = await db.scalar(
        select(Exam.pseudonym_version).where(Exam.id == exam_id).with_for_update(read=True)
    )
    if current != version:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="This exam's pseudonyms were re-keyed; reload the page and try again.",
            headers={"code": "ERR_PSEUDONYM_VERSION"},
        )


async def exam_pseudonyms(db: AsyncSession, exam_id: uuid.UUID) -> set[str]:
    """Every value the exam holds, soft-deleted rows included, so a later restore comes back consistent."""
    identities = await db.scalars(
        select(StudentIdentity.pseudonym_hmac).where(StudentIdentity.exam_id == exam_id)
    )
    submissions = await db.scalars(
        select(ScanSubmission.pseudonym_hmac).where(ScanSubmission.exam_id == exam_id)
    )
    return set(identities) | set(submissions)


def _invalid(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail=detail,
        headers={"code": "ERR_PSEUDONYM_PAIRS"},
    )


async def rekey(db: AsyncSession, exam_id: uuid.UUID, body: PseudonymRekey) -> PseudonymRekeyResult:
    """Compare-and-set on the version first (it takes the exam row lock), then renames every value; any refusal rolls the whole request back."""
    if body.to_version <= body.from_version:
        raise _invalid("A rekey only moves to a later version.")
    moved = await db.execute(
        update(Exam)
        .where(Exam.id == exam_id, Exam.pseudonym_version == body.from_version)
        .values(pseudonym_version=body.to_version)
    )
    if rowcount(moved) == 0:
        current = await db.scalar(select(Exam.pseudonym_version).where(Exam.id == exam_id))
        if current == body.to_version:
            return PseudonymRekeyResult(changed=False, pseudonym_version=current, renamed=0)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The exam's pseudonym version changed meanwhile.",
            headers={"code": "ERR_PSEUDONYM_VERSION_CHANGED"},
        )

    values = await exam_pseudonyms(db, exam_id)
    mapping: dict[str, str] = {}
    for pair in body.pairs:
        if pair.old in mapping:
            raise _invalid("A pseudonym appears twice in the pairs.")
        mapping[pair.old] = pair.new
    # Unknown `old` values are ignored: the client may still hold a value deleted meanwhile.
    renames = {old: mapping[old] for old in values if old in mapping}
    if len(renames) != len(values):
        raise _invalid("The pairs do not cover every pseudonym of the exam; read them again.")
    targets = set(renames.values())
    if len(targets) != len(renames) or targets & values:
        raise _invalid("The new pseudonyms collide.")

    # Identities first: on PostgreSQL the FK cascades the rename to the submissions; SQLite needs the second update.
    for old, new in renames.items():
        await db.execute(
            update(StudentIdentity)
            .where(StudentIdentity.exam_id == exam_id, StudentIdentity.pseudonym_hmac == old)
            .values(pseudonym_hmac=new)
        )
        await db.execute(
            update(ScanSubmission)
            .where(ScanSubmission.exam_id == exam_id, ScanSubmission.pseudonym_hmac == old)
            .values(pseudonym_hmac=new)
        )
    return PseudonymRekeyResult(
        changed=True, pseudonym_version=body.to_version, renamed=len(renames)
    )
