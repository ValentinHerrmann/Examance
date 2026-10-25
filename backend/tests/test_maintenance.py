"""Maintenance mode (issue #130): phases, sign-in pause, teaching freeze, presence counts."""
from __future__ import annotations

from collections.abc import AsyncGenerator
from datetime import timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import ephemeral_store, maintenance
from tests.factors import (
    DEFAULT_PASSWORD,
    complete_login,
    create_teacher,
    current_code,
    enrol_totp,
    sign_in,
    unique_email,
)


@pytest_asyncio.fixture(autouse=True)
async def _no_window_left(db: AsyncSession) -> AsyncGenerator[None, None]:
    # The test database is shared by the whole session: an open window would 503 other tests.
    maintenance.invalidate()
    ephemeral_store.reset()
    yield
    await maintenance.end(db)
    await db.commit()
    maintenance.invalidate()


async def _start(db: AsyncSession, **kwargs: object) -> maintenance.WindowState:
    defaults: dict[str, object] = {
        "kind": "manual",
        "downtime_class": "short",
        "lead_seconds": 300,
        "backup": False,
    }
    defaults.update(kwargs)
    state = await maintenance.start(db, **defaults)  # type: ignore[arg-type]
    await db.commit()
    return state


def test_phases_follow_the_two_reminders() -> None:
    now = maintenance.now_utc()
    state = maintenance.WindowState(
        revision=1,
        kind="manual",
        downtime_class="short",
        first_warning_at=now,
        second_warning_at=now + timedelta(minutes=4),
        starts_at=now + timedelta(minutes=5),
        frozen_at=None,
        auto_end_at=None,
        ended_at=None,
        backup_wanted=False,
        backup_state=None,
        backup_file=None,
        backup_finished_at=None,
        offsite_state=None,
    )
    assert state.phase(now - timedelta(seconds=1)) == "scheduled"
    assert state.phase(now) == "warning"
    assert state.phase(now + timedelta(minutes=4)) == "final"
    assert state.phase(now + timedelta(minutes=5)) == "down"


async def test_lead_zero_is_down_at_once_and_long_lead_is_scheduled(db: AsyncSession) -> None:
    state = await _start(db, lead_seconds=0)
    assert state.phase(maintenance.now_utc()) == "down"
    state = await _start(db, lead_seconds=3600)
    assert state.phase(maintenance.now_utc()) == "scheduled"
    assert state.revision >= 2


async def test_preview_offsets(db: AsyncSession) -> None:
    state = await _start(
        db, kind="deployment", lead_seconds=30, second_warning_seconds=10, backup=True
    )
    assert state.phase(state.first_warning_at) == "warning"
    assert (state.starts_at - state.second_warning_at).total_seconds() == pytest.approx(10)
    assert state.backup_wanted


async def test_short_lead_keeps_two_reminders(db: AsyncSession) -> None:
    state = await _start(db, lead_seconds=60)
    assert state.phase(maintenance.now_utc()) == "warning"
    assert (state.starts_at - state.second_warning_at).total_seconds() == pytest.approx(10)


async def test_open_window_revision_header(client: AsyncClient, db: AsyncSession) -> None:
    state = await _start(db, lead_seconds=600)
    await maintenance.load(db, fresh=True)
    response = await client.get("/api/v1/maintenance")
    assert response.headers.get("maintenance-revision") == str(state.revision)


async def test_deployment_waits_for_freeze_then_blocks_teaching(
    client: AsyncClient, db: AsyncSession
) -> None:
    await sign_in(client, db, unique_email("maint-freeze"))
    state = await _start(db, kind="deployment", lead_seconds=0)
    maintenance.invalidate()
    # Past starts_at but not frozen: sign-in closed, teaching still works.
    assert (await client.get("/api/v1/exams")).status_code == 200
    assert await maintenance.freeze(db, state.revision)
    await db.commit()
    maintenance.invalidate()
    blocked = await client.get("/api/v1/exams")
    assert blocked.status_code == 503
    assert blocked.headers["code"] == "ERR_MAINTENANCE"


async def test_manual_down_blocks_teaching_and_end_lifts_it(
    client: AsyncClient, db: AsyncSession
) -> None:
    await sign_in(client, db, unique_email("maint-manual"))
    await _start(db, lead_seconds=0)
    maintenance.invalidate()
    assert (await client.get("/api/v1/exams")).status_code == 503
    await maintenance.end(db)
    await db.commit()
    maintenance.invalidate()
    assert (await client.get("/api/v1/exams")).status_code == 200


async def test_sign_in_paused_for_teachers_but_not_admins(
    client_factory, db: AsyncSession
) -> None:
    teacher_client, admin_client = await client_factory(2)
    teacher_email, admin_email = unique_email("maint-t"), unique_email("maint-a")
    teacher = await create_teacher(db, teacher_email)
    teacher_secret = await enrol_totp(db, teacher)
    admin = await create_teacher(db, admin_email, role="admin")
    admin_secret = await enrol_totp(db, admin)
    await _start(db, lead_seconds=9)  # inside the last 10 s of a short lead: final
    maintenance.invalidate()

    with pytest.raises(AssertionError):
        await complete_login(teacher_client, teacher_email, teacher_secret)
    await complete_login(admin_client, admin_email, admin_secret)
    assert (await admin_client.get("/api/v1/admin/maintenance")).status_code == 200


async def test_paused_sign_in_keeps_the_pending_step(client: AsyncClient, db: AsyncSession) -> None:
    email = unique_email("maint-step")
    teacher = await create_teacher(db, email)
    secret = await enrol_totp(db, teacher)
    first = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": DEFAULT_PASSWORD}
    )
    client.cookies.update(first.cookies)
    state = await _start(db, lead_seconds=9)
    maintenance.invalidate()
    refused = await client.post("/api/v1/auth/factor/totp", json={"code": current_code(secret)})
    assert refused.headers["code"] == "ERR_MAINTENANCE_LOGIN_BLOCKED"
    await maintenance.end(db, state.revision)
    await db.commit()
    maintenance.invalidate()
    # Refused before the token was spent or the code checked: the same step now finishes.
    finished = await client.post("/api/v1/auth/factor/totp", json={"code": current_code(secret)})
    assert finished.status_code == 200, finished.text
    assert finished.json()["status"] == "ok"


async def test_credential_changes_frozen_while_down(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, unique_email("maint-cred"))
    await _start(db, lead_seconds=0)
    maintenance.invalidate()
    resp = await client.post(
        "/api/v1/auth/change-password",
        json={"current_password": DEFAULT_PASSWORD, "new_password": "x" * 20, "envelope": {}},
    )
    assert resp.status_code == 503
    assert resp.headers["code"] == "ERR_MAINTENANCE_ACCOUNT_PAUSED"


async def test_deployment_never_replaces_manual_or_frozen_window(db: AsyncSession) -> None:
    await _start(db, lead_seconds=0)
    with pytest.raises(maintenance.WindowBusyError):
        await _start(db, kind="deployment")


async def test_frozen_deployment_blocks_new_windows_and_lives_45_minutes(db: AsyncSession) -> None:
    state = await _start(db, kind="deployment", lead_seconds=0)
    assert await maintenance.freeze(db, state.revision)
    await db.commit()
    frozen = await maintenance.load(db, fresh=True)
    assert frozen is not None
    assert frozen.frozen_at is not None
    assert frozen.auto_end_at is not None
    assert frozen.auto_end_at - frozen.frozen_at == timedelta(minutes=45)
    with pytest.raises(maintenance.WindowBusyError):
        await _start(db, kind="deployment")
    with pytest.raises(maintenance.WindowBusyError):
        await _start(db)


async def test_stale_revision_does_not_end_the_newer_window(db: AsyncSession) -> None:
    old = await _start(db, kind="deployment")
    new = await _start(db, kind="deployment")
    assert not await maintenance.end(db, old.revision)
    assert not await maintenance.freeze(db, old.revision)
    assert await maintenance.end(db, new.revision)


async def test_deployment_window_ends_itself(db: AsyncSession) -> None:
    state = await _start(db, kind="deployment", lead_seconds=0)
    assert state.auto_end_at is not None
    assert state.phase(state.auto_end_at) == "none"


async def test_start_now_keeps_revision_and_safety_net(db: AsyncSession) -> None:
    manual = await _start(db)
    started = await maintenance.start_now(db, manual.revision)
    assert started is not None and started.revision == manual.revision
    assert started.phase(maintenance.now_utc()) == "down"
    assert await maintenance.start_now(db, manual.revision) is None  # already down

    deployment = await _start(db, kind="deployment")
    started = await maintenance.start_now(db, deployment.revision)
    assert started is not None and started.auto_end_at == deployment.auto_end_at
    # A deployment is down only once CI froze it.
    assert started.phase(maintenance.now_utc()) == "final"
    assert await maintenance.start_now(db, deployment.revision - 1) is None
    assert await maintenance.freeze(db, deployment.revision)
    assert await maintenance.start_now(db, deployment.revision) is None


async def test_admin_start_now_endpoint(client: AsyncClient, db: AsyncSession) -> None:
    admin_email = unique_email("maint-now")
    admin = await create_teacher(db, admin_email, role="admin")
    secret = await enrol_totp(db, admin)
    await complete_login(client, admin_email, secret)
    state = await _start(db)
    url = "/api/v1/admin/maintenance/start-now"
    ok = await client.post(url, json={"revision": state.revision})
    assert ok.status_code == 200
    assert ok.json()["status"]["phase"] == "down"
    again = await client.post(url, json={"revision": state.revision})
    assert again.status_code == 409
    assert again.headers["code"] == "ERR_MAINTENANCE_NOT_PENDING"


async def test_status_is_public_and_counts_presence(
    client: AsyncClient, db: AsyncSession
) -> None:
    anonymous = await client.get("/api/v1/maintenance")
    assert anonymous.status_code == 200
    assert anonymous.json()["phase"] == "none"

    await sign_in(client, db, unique_email("maint-presence"))
    state = await _start(db, lead_seconds=120)
    maintenance.invalidate()
    seen = await client.get("/api/v1/maintenance")
    assert seen.json()["phase"] == "warning"
    assert (
        await client.post("/api/v1/maintenance/ready", json={"revision": state.revision})
    ).status_code == 204

    counts = await maintenance.presence_counts(state.revision)
    assert (counts.online, counts.warned, counts.ready) == (1, 1, 1)


async def test_counts_unknown_when_redis_unreachable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ephemeral_store, "uses_redis", lambda: True)
    monkeypatch.setattr(ephemeral_store, "_circuit_is_open", lambda: True)
    counts = await maintenance.presence_counts(1)
    assert counts.online is None
