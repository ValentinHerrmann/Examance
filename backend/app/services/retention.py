"""Retention service — enforce GDPR Art. 5(1)(e) storage limitation."""
from __future__ import annotations

import hashlib
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, func, select, update

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.account_deletion_request import AccountDeletionRequest
from app.models.audit_log import AuditLog
from app.models.exam import Exam
from app.models.exercise import Exercise
from app.models.key_envelope import KeyEnvelope
from app.models.omr_training_sample import OmrTrainingSample
from app.models.registration_request import RegistrationRequest
from app.models.scan_submission import ScanSubmission
from app.models.student_identity import StudentIdentity
from app.models.teacher import Teacher


async def run(*, dry_run: bool = False) -> int:
    """
    Apply the retention policy. Returns the number of affected rows.

    1. Exams past ``retention_until`` are soft-deleted, and their student
       identities and submissions are stamped with a grace deadline.
    2. Student identities and submissions whose grace deadline has passed are
       hard-deleted.
    3. Audit entries older than AUDIT_LOG_RETENTION_DAYS are removed.
    4. Donated OMR training samples older than TRAINING_SAMPLE_RETENTION_DAYS
       are removed.
    5. Registration requests whose verification link expired are removed.
    6. Verified registrations nobody approved within PENDING_ACCOUNT_RETENTION_DAYS
       are removed. Only plain teacher accounts that hold nothing (no exam,
       exercise or key envelope) qualify: a pending account cannot create data,
       so anything that does is not a stale registration and is left alone.
    7. Account-deletion links that expired unconfirmed are removed (a confirmed
       one goes with its account).

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
    sample_cutoff = today - timedelta(days=settings.TRAINING_SAMPLE_RETENTION_DAYS)
    pending_cutoff = now - timedelta(days=settings.PENDING_ACCOUNT_RETENTION_DAYS)

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

        # 4. Anonymous training samples past their retention period. Counted, then
        # deleted by date below — never by an id list, which a backlog would push
        # past the driver's bind-parameter limit.
        expired_sample_filter = OmrTrainingSample.created_on < sample_cutoff
        expired_sample_count = (
            await db.scalar(
                select(func.count()).select_from(OmrTrainingSample).where(expired_sample_filter)
            )
        ) or 0

        # 5. Registration links that expired unused.
        expired_requests_res = await db.execute(
            select(RegistrationRequest).where(RegistrationRequest.expires_at < now)
        )
        expired_requests = list(expired_requests_res.scalars().all())

        # 7. Account-deletion links that expired unconfirmed.
        expired_deletions_filter = AccountDeletionRequest.expires_at < now
        expired_deletion_count = await db.scalar(
            select(func.count()).select_from(AccountDeletionRequest).where(
                expired_deletions_filter
            )
        ) or 0

        # 6. Pending accounts nobody approved, holding no data.
        stale_pending_res = await db.execute(
            select(Teacher).where(
                Teacher.approved_at.is_(None),
                Teacher.role == "teacher",
                Teacher.created_at < pending_cutoff,
                ~select(Exam.id).where(Exam.teacher_id == Teacher.id).exists(),
                ~select(Exercise.id).where(Exercise.teacher_id == Teacher.id).exists(),
                ~select(KeyEnvelope.id).where(KeyEnvelope.teacher_id == Teacher.id).exists(),
            )
        )
        stale_pending = list(stale_pending_res.scalars().all())

        total_affected = (
            len(expired_exams)
            + len(expired_students)
            + len(expired_submissions)
            + len(expired_audit)
            + expired_sample_count
            + len(expired_requests)
            + len(stale_pending)
            + expired_deletion_count
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

        if expired_sample_count:
            await db.execute(delete(OmrTrainingSample).where(expired_sample_filter))

        for registration in expired_requests:
            await db.delete(registration)

        for account in stale_pending:
            await db.delete(account)

        if expired_deletion_count:
            await db.execute(delete(AccountDeletionRequest).where(expired_deletions_filter))

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
            + [
                # Same for expired pending accounts: the id's hash, never the address.
                AuditLog(
                    teacher_id=None,
                    teacher_email="system:retention-cron",
                    action="USER_REJECTED",
                    target_hash=hashlib.sha256(str(account.id).encode()).hexdigest(),
                    ip_hash=None,
                )
                for account in stale_pending
            ]
        )
        await db.commit()

    return total_affected
