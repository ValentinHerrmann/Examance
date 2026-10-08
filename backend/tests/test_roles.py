"""Admins manage users and the server only (issue #58): every teaching endpoint refuses them."""
from __future__ import annotations

import uuid
from datetime import date, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from .factors import sign_in, unique_email

TEACHER_ROLE_REQUIRED = "ERR_TEACHER_ROLE_REQUIRED"


async def test_admin_cannot_list_exams(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, unique_email("admin"), role="admin")

    resp = await client.get("/api/v1/exams")

    assert resp.status_code == 403
    assert resp.headers.get("code") == TEACHER_ROLE_REQUIRED


async def test_admin_cannot_create_exercises(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, unique_email("admin"), role="admin")

    resp = await client.post(
        "/api/v1/exercises", json={"name": "Not for admins", "latex_body": "\\BE Question"}
    )

    assert resp.status_code == 403
    assert resp.headers.get("code") == TEACHER_ROLE_REQUIRED


async def test_admin_has_no_storage_mode_or_features(
    client: AsyncClient, db: AsyncSession
) -> None:
    await sign_in(client, db, unique_email("admin"), role="admin")

    caps = await client.get("/api/v1/user/capabilities")
    assert caps.status_code == 200
    assert caps.json()["allowed_storage_modes"] == []
    assert not any(caps.json()["features"].values())

    mode = await client.put("/api/v1/user/storage-mode", json={"mode": "hybrid", "expected": None})
    assert mode.status_code == 403
    assert mode.headers.get("code") == TEACHER_ROLE_REQUIRED


async def test_admin_keeps_user_server_and_account_endpoints(
    client: AsyncClient, db: AsyncSession
) -> None:
    await sign_in(client, db, unique_email("admin"), role="admin")

    assert (await client.get("/api/v1/admin/users")).status_code == 200
    assert (await client.get("/api/v1/admin/allowed-domains")).status_code == 200
    assert (await client.get("/api/v1/user/me/export")).status_code == 200


async def test_admin_exam_statistics_endpoint_is_gone(
    client: AsyncClient, db: AsyncSession
) -> None:
    # It answered any admin with the score statistics of any teacher's exam.
    await sign_in(client, db, unique_email("admin"), role="admin")

    resp = await client.get(f"/api/v1/admin/stats/{uuid.uuid4()}")

    assert resp.status_code == 404


async def test_teacher_reaches_teaching_endpoints(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, unique_email("teacher"))

    assert (await client.get("/api/v1/exams")).status_code == 200
    created = await client.post(
        "/api/v1/exercises", json={"name": "For teachers", "latex_body": "\\BE Question"}
    )
    assert created.status_code == 201, created.text


async def test_promoted_account_cannot_reach_its_exams(
    client: AsyncClient, db: AsyncSession
) -> None:
    teacher = await sign_in(client, db, unique_email("promoted"))
    retention = (date.today() + timedelta(days=365)).isoformat()
    exam = await client.post(
        "/api/v1/exams", json={"title": "Before promotion", "retention_until": retention}
    )
    assert exam.status_code == 201, exam.text

    teacher.role = "admin"
    await db.commit()

    resp = await client.get(f"/api/v1/exams/{exam.json()['id']}")
    assert resp.status_code == 403
    assert resp.headers.get("code") == TEACHER_ROLE_REQUIRED
