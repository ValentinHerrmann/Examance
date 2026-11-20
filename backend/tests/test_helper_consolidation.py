"""One helper per job (issue #299): base64, the daily quota and the ownership lookups."""
from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exam import Exam
from app.models.exercise import Exercise
from app.models.teacher import Teacher
from app.schemas.binary import decode_b64, encode_b64, encode_b64_or_none, strict_b64decode
from app.services import ephemeral_store
from app.services.exam_queries import find_own_exam, find_own_exercise
from app.services.result_deliveries import require_own_exam


def test_base64_round_trip_and_empty_values() -> None:
    assert strict_b64decode(encode_b64(b"\x00\xffdata")) == b"\x00\xffdata"
    assert encode_b64(b"") == ""
    assert encode_b64_or_none(None) is None
    assert encode_b64_or_none(b"") is None
    assert encode_b64_or_none(b"ab") == "YWI="


def test_strict_decoding_refuses_stray_characters() -> None:
    with pytest.raises(ValueError, match="base64"):
        strict_b64decode("YW I=")
    with pytest.raises(HTTPException) as caught:
        decode_b64("YW I=", "field")
    assert caught.value.status_code == 400


@pytest.mark.asyncio
async def test_daily_quota_reserves_up_to_the_limit_and_releases() -> None:
    account = uuid.uuid4()
    now = datetime(2026, 11, 20, 12, tzinfo=UTC)
    first = await ephemeral_store.reserve_daily_quota("test-q:", account, 3, 2, now=now)
    assert first is not None
    assert str(account) not in first.key
    assert await ephemeral_store.reserve_daily_quota("test-q:", account, 3, 2, now=now) is None
    await first.release()
    assert await ephemeral_store.reserve_daily_quota("test-q:", account, 3, 3, now=now) is not None
    tomorrow = now + timedelta(days=1)
    assert await ephemeral_store.reserve_daily_quota("test-q:", account, 3, 3, now=tomorrow) is not None


async def _teacher(db: AsyncSession) -> Teacher:
    teacher = Teacher(email=f"{uuid.uuid4().hex}@example.org", password_hash=None, role="teacher", approved_at=datetime.now(UTC))
    db.add(teacher)
    await db.flush()
    return teacher


@pytest.mark.asyncio
async def test_ownership_lookups_hide_foreign_and_deleted_rows(db: AsyncSession) -> None:
    owner, other = await _teacher(db), await _teacher(db)
    retention = date.today() + timedelta(days=30)
    live = Exam(teacher_id=owner.id, title="Live", retention_until=retention)
    gone = Exam(teacher_id=owner.id, title="Gone", retention_until=retention, deleted_at=datetime.now(UTC))
    exercise = Exercise(teacher_id=owner.id, name="Own")
    db.add_all([live, gone, exercise])
    await db.flush()

    assert await find_own_exam(db, owner.id, live.id) is live
    assert await find_own_exam(db, owner.id, gone.id) is None
    assert await find_own_exam(db, other.id, live.id) is None
    assert await find_own_exercise(db, owner.id, exercise.id) is exercise
    assert await find_own_exercise(db, other.id, exercise.id) is None

    await require_own_exam(db, owner.id, live.id)
    for teacher_id, exam_id in ((other.id, live.id), (owner.id, gone.id)):
        with pytest.raises(HTTPException) as caught:
            await require_own_exam(db, teacher_id, exam_id)
        assert caught.value.status_code == 404
