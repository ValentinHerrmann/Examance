"""Retention policy tests (GDPR Art. 5(1)(e), Art. 17).

Guards that expiring an exam also stamps its students and submissions with a grace deadline:
nothing else sets retention_until and nothing hard-deletes an Exam, so data would stay forever."""
from __future__ import annotations

import base64
import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from app.models.audit_log import AuditLog
from app.models.exam import Exam
from app.models.scan_submission import ScanSubmission
from app.models.student_identity import StudentIdentity
from app.models.teacher import Teacher
from app.services import retention
from app.services.crypto import hash_password
from tests.factors import sign_in, unique_email


@pytest_asyncio.fixture
async def retention_db(engine, monkeypatch):
    """Point the retention service at the test engine and yield a session."""
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(retention, "AsyncSessionLocal", session_factory)
    async with session_factory() as session:
        yield session


async def _seed_exam(
    db: AsyncSession, *, retention_until: date, with_children: bool = True
) -> Exam:
    teacher = Teacher(
        email=f"retention-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("twelve-chars-plus"),
        role="teacher",
        approved_at=datetime.now(UTC),
    )
    db.add(teacher)
    await db.flush()

    exam = Exam(
        teacher_id=teacher.id,
        title="Expiring exam",
        latex_template="",
        retention_until=retention_until,
    )
    db.add(exam)
    await db.flush()

    if with_children:
        pseudonym = uuid.uuid4().hex * 2  # 64 hex chars
        db.add(
            StudentIdentity(
                pseudonym_hmac=pseudonym[:64],
                exam_id=exam.id,
                pii_ciphertext=b"ciphertext",
                iv=b"\x00" * 12,
                encryption_salt=b"\x00" * 16,
            )
        )
        db.add(
            ScanSubmission(
                exam_id=exam.id,
                pseudonym_hmac=pseudonym[:64],
                scan_iv=b"\x00" * 12,
            )
        )
        await db.flush()

    await db.commit()
    return exam


@pytest.mark.asyncio
async def test_expired_exam_stamps_its_student_data_for_erasure(retention_db) -> None:
    exam = await _seed_exam(retention_db, retention_until=date.today() - timedelta(days=1))

    affected = await retention.run()
    assert affected >= 1

    refreshed = (
        await retention_db.execute(select(Exam).where(Exam.id == exam.id))
    ).scalar_one()
    assert refreshed.deleted_at is not None

    identity = (
        await retention_db.execute(
            select(StudentIdentity).where(StudentIdentity.exam_id == exam.id)
        )
    ).scalar_one()
    submission = (
        await retention_db.execute(
            select(ScanSubmission).where(ScanSubmission.exam_id == exam.id)
        )
    ).scalar_one()

    # This is the bug: both used to be left untouched forever.
    assert identity.deleted_at is not None
    assert identity.retention_until == date.today() + timedelta(
        days=settings.RETENTION_GRACE_DAYS
    )
    assert submission.deleted_at is not None
    assert submission.retention_until is not None


@pytest.mark.asyncio
async def test_data_survives_until_the_grace_period_elapses(retention_db) -> None:
    exam = await _seed_exam(retention_db, retention_until=date.today() - timedelta(days=1))
    await retention.run()
    await retention.run()  # idempotent; must not erase early

    identity = (
        await retention_db.execute(
            select(StudentIdentity).where(StudentIdentity.exam_id == exam.id)
        )
    ).scalar_one_or_none()
    assert identity is not None, "erased before the grace period elapsed"


@pytest.mark.asyncio
async def test_data_is_hard_deleted_once_the_grace_period_passes(retention_db) -> None:
    exam = await _seed_exam(retention_db, retention_until=date.today() - timedelta(days=1))
    await retention.run()

    # Wind the grace deadline into the past, as the passage of time would.
    past = date.today() - timedelta(days=1)
    for model in (StudentIdentity, ScanSubmission):
        rows = (
            await retention_db.execute(select(model).where(model.exam_id == exam.id))
        ).scalars().all()
        for row in rows:
            row.retention_until = past
    await retention_db.commit()

    await retention.run()

    identity = (
        await retention_db.execute(
            select(StudentIdentity).where(StudentIdentity.exam_id == exam.id)
        )
    ).scalar_one_or_none()
    submission = (
        await retention_db.execute(
            select(ScanSubmission).where(ScanSubmission.exam_id == exam.id)
        )
    ).scalar_one_or_none()
    assert identity is None
    assert submission is None


@pytest.mark.asyncio
async def test_unexpired_exam_is_untouched(retention_db) -> None:
    exam = await _seed_exam(retention_db, retention_until=date.today() + timedelta(days=30))
    await retention.run()

    refreshed = (
        await retention_db.execute(select(Exam).where(Exam.id == exam.id))
    ).scalar_one()
    identity = (
        await retention_db.execute(
            select(StudentIdentity).where(StudentIdentity.exam_id == exam.id)
        )
    ).scalar_one()
    assert refreshed.deleted_at is None
    assert identity.deleted_at is None


@pytest.mark.asyncio
async def test_dry_run_writes_nothing(retention_db) -> None:
    exam = await _seed_exam(retention_db, retention_until=date.today() - timedelta(days=1))

    count = await retention.run(dry_run=True)
    assert count >= 1

    refreshed = (
        await retention_db.execute(select(Exam).where(Exam.id == exam.id))
    ).scalar_one()
    identity = (
        await retention_db.execute(
            select(StudentIdentity).where(StudentIdentity.exam_id == exam.id)
        )
    ).scalar_one()
    assert refreshed.deleted_at is None
    assert identity.deleted_at is None


@pytest.mark.asyncio
async def test_audit_entries_past_retention_are_removed(retention_db) -> None:
    stale = AuditLog(
        teacher_id=None,
        teacher_email="stale@example.com",
        action="LOGIN",
        created_at=datetime.now(tz=UTC)
        - timedelta(days=settings.AUDIT_LOG_RETENTION_DAYS + 1),
    )
    fresh = AuditLog(
        teacher_id=None,
        teacher_email="fresh@example.com",
        action="LOGIN",
        created_at=datetime.now(tz=UTC),
    )
    retention_db.add_all([stale, fresh])
    await retention_db.commit()

    await retention.run()

    remaining = (
        await retention_db.execute(
            select(AuditLog).where(AuditLog.teacher_email.in_(["stale@example.com", "fresh@example.com"]))
        )
    ).scalars().all()
    emails = {entry.teacher_email for entry in remaining}
    assert "stale@example.com" not in emails
    assert "fresh@example.com" in emails


async def _exam_with_results(client: AsyncClient) -> tuple[str, str, str]:
    """An exam with one student identity and one submission, created through the API."""
    exam = await client.post(
        "/api/v1/exams",
        json={
            "title": "Exam to delete",
            "retention_until": (date.today() + timedelta(days=365)).isoformat(),
        },
    )
    assert exam.status_code == 201, exam.text
    exam_id = exam.json()["id"]
    pseudonym = uuid.uuid4().hex * 2
    student = await client.post(
        f"/api/v1/exams/{exam_id}/students",
        json={
            "pseudonym_hmac": pseudonym,
            "pii_ciphertext_b64": base64.b64encode(b"PII").decode(),
            "iv_b64": base64.b64encode(b"\x01" * 12).decode(),
            "encryption_salt_b64": base64.b64encode(b"\x02" * 16).decode(),
        },
    )
    assert student.status_code == 201, student.text
    submission = await client.post(
        f"/api/v1/exams/{exam_id}/submissions",
        json={"pseudonym_hmac": pseudonym, "total_score": 7.0},
    )
    assert submission.status_code == 201, submission.text
    return exam_id, pseudonym, submission.json()["id"]


async def _children(db: AsyncSession, exam_id: str) -> tuple[StudentIdentity, ScanSubmission]:
    db.expire_all()
    exam_uuid = uuid.UUID(exam_id)
    identity = (
        await db.execute(select(StudentIdentity).where(StudentIdentity.exam_id == exam_uuid))
    ).scalar_one()
    submission = (
        await db.execute(select(ScanSubmission).where(ScanSubmission.exam_id == exam_uuid))
    ).scalar_one()
    return identity, submission


@pytest.mark.asyncio
async def test_deleting_an_exam_starts_the_grace_period_of_its_student_data(
    client: AsyncClient, retention_db
) -> None:
    await sign_in(client, retention_db, unique_email("delete-exam"))
    exam_id, _, _ = await _exam_with_results(client)

    deleted = await client.delete(f"/api/v1/exams/{exam_id}")
    assert deleted.status_code == 204

    identity, submission = await _children(retention_db, exam_id)
    deadline = date.today() + timedelta(days=settings.RETENTION_GRACE_DAYS)
    assert identity.deleted_at is not None
    assert identity.retention_until == deadline
    assert submission.deleted_at is not None
    assert submission.retention_until == deadline

    # Once the grace period has passed, retention erases them (it used to skip them forever).
    identity.retention_until = date.today() - timedelta(days=1)
    submission.retention_until = date.today() - timedelta(days=1)
    await retention_db.commit()
    await retention.run()

    retention_db.expire_all()
    exam_uuid = uuid.UUID(exam_id)
    for model in (StudentIdentity, ScanSubmission):
        remaining = (
            await retention_db.execute(select(model).where(model.exam_id == exam_uuid))
        ).scalar_one_or_none()
        assert remaining is None


@pytest.mark.asyncio
async def test_deleting_a_submission_sets_its_erasure_deadline(
    client: AsyncClient, retention_db
) -> None:
    await sign_in(client, retention_db, unique_email("delete-submission"))
    exam_id, _, submission_id = await _exam_with_results(client)

    deleted = await client.delete(f"/api/v1/exams/{exam_id}/submissions/{submission_id}")
    assert deleted.status_code == 204

    _, submission = await _children(retention_db, exam_id)
    assert submission.deleted_at is not None
    assert submission.retention_until == date.today() + timedelta(
        days=settings.RETENTION_GRACE_DAYS
    )


@pytest.mark.asyncio
async def test_restore_never_revives_a_deleted_exams_student_data(
    client: AsyncClient, retention_db
) -> None:
    await sign_in(client, retention_db, unique_email("restore-deleted"))
    exam_id, _, _ = await _exam_with_results(client)
    assert (await client.delete(f"/api/v1/exams/{exam_id}")).status_code == 204

    restored = await client.post("/api/v1/user/restore-server-data")
    assert restored.status_code == 200, restored.text
    assert restored.json()["restored_student_identities"] == 0
    assert restored.json()["restored_submissions"] == 0

    identity, submission = await _children(retention_db, exam_id)
    assert identity.deleted_at is not None
    assert submission.deleted_at is not None
