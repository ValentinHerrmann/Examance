"""Retention service — enforce GDPR Art. 5(1)(e) storage limitation."""
from __future__ import annotations

import hashlib
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select, update

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.audit_log import AuditLog
from app.models.exam import Exam
from app.models.scan_submission import ScanSubmission
from app.models.student_identity import StudentIdentity


async def run(*, dry_run: bool = False) -> int:
    """
    Apply the retention policy. Returns the number of affected rows.

    1. Exams past ``retention_until`` are soft-deleted, and their student
       identities and submissions are stamped with a grace deadline.
    2. Student identities and submissions whose grace deadline has passed are
       hard-deleted.
    3. Audit entries older than AUDIT_LOG_RETENTION_DAYS are removed.

    Step 1's cascade is the part that matters: soft-deleting the exam alone —
    which is all this service used to do — left the student personal data in the
    database forever, because nothing else ever set ``retention_until`` on those
    rows and no code path hard-deletes an Exam.

    Idempotent: re-running skips rows already handled.
    """
    today = date.today()
    now = datetime.now(tz=UTC)
    grace_deadline = today + timedelta(days=settings.RETENTION_GRACE_DAYS)
    audit_cutoff = now - timedelta(days=settings.AUDIT_LOG_RETENTION_DAYS)

    async with AsyncSessionLocal() as db:
        # 1. Exams whose retention period has elapsed.
        expired_exams_res = await db.execute(
            select(Exam).where(
                Exam.retention_until < today,
                Exam.deleted_at.is_(None),
            )
        )
        expired_exams = list(expired_exams_res.scalars().all())
        expired_exam_ids = [exam.id for exam in expired_exams]

        # 2. Child rows already past their grace deadline.
        expired_students_res = await db.execute(
            select(StudentIdentity).where(
                StudentIdentity.retention_until < today,
                StudentIdentity.deleted_at.isnot(None),
            )
        )
        expired_students = list(expired_students_res.scalars().all())

        expired_submissions_res = await db.execute(
            select(ScanSubmission).where(
                ScanSubmission.retention_until < today,
                ScanSubmission.deleted_at.isnot(None),
            )
        )
        expired_submissions = list(expired_submissions_res.scalars().all())

        # 3. Audit entries past their own retention period.
        expired_audit_res = await db.execute(
            select(AuditLog).where(AuditLog.created_at < audit_cutoff)
        )
        expired_audit = list(expired_audit_res.scalars().all())

        total_affected = (
            len(expired_exams)
            + len(expired_students)
            + len(expired_submissions)
            + len(expired_audit)
        )

        if dry_run:
            return total_affected

        # Soft-delete the exams and cascade the deadline onto their child rows,
        # so the next run (after the grace period) erases them for good.
        for exam in expired_exams:
            exam.deleted_at = now

        if expired_exam_ids:
            await db.execute(
                update(StudentIdentity)
                .where(
                    StudentIdentity.exam_id.in_(expired_exam_ids),
                    StudentIdentity.deleted_at.is_(None),
                )
                .values(deleted_at=now, retention_until=grace_deadline)
            )
            await db.execute(
                update(ScanSubmission)
                .where(
                    ScanSubmission.exam_id.in_(expired_exam_ids),
                    ScanSubmission.deleted_at.is_(None),
                )
                .values(deleted_at=now, retention_until=grace_deadline)
            )

        for student in expired_students:
            await db.delete(student)

        for submission in expired_submissions:
            await db.delete(submission)

        for entry in expired_audit:
            await db.delete(entry)

        # Audit the exam expiries. Deliberately no entry per erased student
        # record: that would recreate, in the audit trail, the very identifiers
        # the erasure is meant to remove.
        db.add_all(
            [
                AuditLog(
                    teacher_id=None,  # System actor
                    teacher_email="system:retention-cron",
                    action="DELETE",
                    target_hash=hashlib.sha256(str(exam.id).encode()).hexdigest(),
                    ip_hash=None,
                )
                for exam in expired_exams
            ]
        )
        await db.commit()

    return total_affected
