"""Phase 3 API integration tests (Exams, Students, Submissions, Admin, Retention)."""
from __future__ import annotations

import base64
import secrets
import uuid
from datetime import date, timedelta
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app

from .factors import sign_in


async def _create_teacher_and_login(
    client: AsyncClient, db: AsyncSession, email: str, role: str = "teacher"
) -> None:
    # Two factors, because one no longer produces a session. See tests/factors.py.
    await sign_in(client, db, email, role=role)


@pytest.mark.asyncio
async def test_exam_crud_flow(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "examteacher@example.com")

    # Create exam
    retention_date = (date.today() + timedelta(days=365)).isoformat()
    resp = await client.post(
        "/api/v1/exams",
        json={
            "title": "Algorithms 101",
            "latex_template": "\\documentclass{article}",
            "retention_until": retention_date,
            "exercises": [
                {"order_index": 1, "max_points": 10.0, "question_type": "free_text"},
                {"order_index": 2, "max_points": 5.0, "question_type": "mc", "penalty": -1.0},
            ],
        },
    )
    assert resp.status_code == 201
    exam = resp.json()
    exam_id = exam["id"]
    assert exam["title"] == "Algorithms 101"
    assert len(exam["exercises"]) == 2

    # Get exam
    get_resp = await client.get(f"/api/v1/exams/{exam_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["title"] == "Algorithms 101"

    # Get exam exercises
    ex_resp = await client.get(f"/api/v1/exams/{exam_id}/exercises")
    assert ex_resp.status_code == 200
    assert len(ex_resp.json()) == 2


    # List exams
    list_resp = await client.get("/api/v1/exams")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    # Soft delete exam
    del_resp = await client.delete(f"/api/v1/exams/{exam_id}")
    assert del_resp.status_code == 204

    # Deleted exam is inaccessible (returns 401 per API security contract)
    get_del_resp = await client.get(f"/api/v1/exams/{exam_id}")
    assert get_del_resp.status_code == 401


@pytest.mark.asyncio
async def test_student_and_submission_upload(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "studentteacher@example.com")

    # Create exam
    e_resp = await client.post(
        "/api/v1/exams",
        json={"title": "Data Structures", "retention_until": "2027-12-31"},
    )
    exam_id = e_resp.json()["id"]

    # Upload Student Identity
    pseudonym_hmac = "a" * 64
    st_resp = await client.post(
        f"/api/v1/exams/{exam_id}/students",
        json={
            "pseudonym_hmac": pseudonym_hmac,
            "pii_ciphertext_b64": base64.b64encode(b"EncryptedPII").decode(),
            "iv_b64": base64.b64encode(b"123456789012").decode(),
            "encryption_salt_b64": base64.b64encode(b"1234567890123456").decode(),
        },
    )
    assert st_resp.status_code == 201

    # Upload Submission
    sub_resp = await client.post(
        f"/api/v1/exams/{exam_id}/submissions",
        json={
            "pseudonym_hmac": pseudonym_hmac,
            "scan_ciphertext_b64": base64.b64encode(b"EncryptedScan").decode(),
            "scan_iv_b64": base64.b64encode(b"123456789012").decode(),
            "total_score": 85.5,
        },
    )
    assert sub_resp.status_code == 201
    sub_id = sub_resp.json()["id"]

    # Download Submission
    get_sub = await client.get(f"/api/v1/exams/{exam_id}/submissions/{sub_id}")
    assert get_sub.status_code == 200
    assert get_sub.json()["total_score"] == 85.5

    # Delete Submission
    del_sub = await client.delete(f"/api/v1/exams/{exam_id}/submissions/{sub_id}")
    assert del_sub.status_code == 204

    # Deleted submission is now not found
    get_del_sub = await client.get(f"/api/v1/exams/{exam_id}/submissions/{sub_id}")
    assert get_del_sub.status_code == 404

    # GDPR Student Erasure
    erase_resp = await client.delete(f"/api/v1/exams/{exam_id}/students/{pseudonym_hmac}")
    assert erase_resp.status_code == 204


@pytest.mark.asyncio
async def test_student_and_submission_upsert(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "teacher2@example.com")
    e_resp = await client.post(
        "/api/v1/exams",
        json={"title": "Upsert Exam", "retention_until": "2027-12-31"},
    )
    exam_id = e_resp.json()["id"]

    pseudonym_hmac = "c" * 64
    payload_st = {
        "pseudonym_hmac": pseudonym_hmac,
        "pii_ciphertext_b64": base64.b64encode(b"PII1").decode(),
        "iv_b64": base64.b64encode(b"123456789012").decode(),
        "encryption_salt_b64": base64.b64encode(b"1234567890123456").decode(),
    }

    # Upload student identity 1st time
    st_resp1 = await client.post(f"/api/v1/exams/{exam_id}/students", json=payload_st)
    assert st_resp1.status_code == 201

    # Upload same student identity 2nd time (upsert)
    st_resp2 = await client.post(f"/api/v1/exams/{exam_id}/students", json=payload_st)
    assert st_resp2.status_code == 201

    # Upload submission with existing ID (upsert)
    sub_id = str(uuid.uuid4())
    payload_sub = {
        "id": sub_id,
        "pseudonym_hmac": pseudonym_hmac,
        "scan_ciphertext_b64": base64.b64encode(b"Scan1").decode(),
        "scan_iv_b64": base64.b64encode(b"123456789012").decode(),
        "total_score": 92.0,
    }
    sub_resp1 = await client.post(f"/api/v1/exams/{exam_id}/submissions", json=payload_sub)
    assert sub_resp1.status_code == 201

    # Upsert submission
    payload_sub["total_score"] = 95.0
    sub_resp2 = await client.post(f"/api/v1/exams/{exam_id}/submissions", json=payload_sub)
    assert sub_resp2.status_code == 201
    assert sub_resp2.json()["total_score"] == 95.0


@pytest.mark.asyncio
async def test_admin_stats_k_anonymity(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "admin@example.com", role="admin")

    e_resp = await client.post(
        "/api/v1/exams",
        json={"title": "Stats Exam", "retention_until": "2027-12-31"},
    )
    exam_id = e_resp.json()["id"]

    # Less than 5 submissions -> suppressed
    stats1 = await client.get(f"/api/v1/admin/stats/{exam_id}")
    assert stats1.status_code == 200
    assert stats1.json()["k_anonymity_satisfied"] is False
    assert stats1.json()["mean_score"] is None


@pytest.mark.asyncio
async def test_admin_can_create_teacher_user(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "admin-create@example.com", role="admin")

    create_resp = await client.post(
        "/api/v1/admin/users",
        json={
            "email": "newteacher-api@example.com",
            "role": "teacher",
        },
    )
    assert create_resp.status_code == 201
    body = create_resp.json()
    assert body["email"] == "newteacher-api@example.com"
    assert body["role"] == "teacher"
    assert body["password_reset_sent"] is True

    # The created account has no password yet. Login answers with the generic
    # credential error — an account-specific "no password set" response would
    # tell an unauthenticated caller which addresses exist here.
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "newteacher-api@example.com", "password": "AnyPassword123!"},
    )
    assert login_resp.status_code == 401
    assert login_resp.headers.get("code") == "ERR_INVALID_CREDENTIALS"


@pytest.mark.asyncio
async def test_non_admin_cannot_create_users(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "regular-teacher@example.com", role="teacher")

    resp = await client.post(
        "/api/v1/admin/users",
        json={
            "email": "blocked@example.com",
            "role": "teacher",
        },
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_create_user_duplicate_email_conflict(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "admin-duplicate@example.com", role="admin")

    first = await client.post(
        "/api/v1/admin/users",
        json={
            "email": "dup@example.com",
            "password": "StrongPassw0rd!",
            "role": "teacher",
        },
    )
    assert first.status_code == 201

    second = await client.post(
        "/api/v1/admin/users",
        json={
            "email": "dup@example.com",
            "password": "StrongPassw0rd!",
            "role": "teacher",
        },
    )
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_exercise_versions_and_variants(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "exerciseteacher@example.com")

    # Create base exercise
    create_res = await client.post(
        "/api/v1/exercises",
        json={
            "name": "Typ1_Vererbung",
            "topic_tag": "_Vererbung",
            "latex_body": "\\begin{Aufgabe}[10] Vererbung \\BE \\hBE \\end{Aufgabe}",
            "variant_key": "Moebel",
        },
    )
    assert create_res.status_code == 201
    ex1 = create_res.json()
    assert ex1["version"] == 1
    assert ex1["max_points"] == 10.0
    assert ex1["variant_key"] == "Moebel"
    ex1_id = ex1["id"]

    # Create new version (correction)
    ver_res = await client.post(
        f"/api/v1/exercises/{ex1_id}/new-version",
        json={
            "latex_body": "\\begin{Aufgabe}[12] Vererbung Updated \\BE \\hBE \\qBE \\end{Aufgabe}",
        },
    )
    assert ver_res.status_code == 201
    ex1_v2 = ver_res.json()
    assert ex1_v2["version"] == 2
    assert ex1_v2["max_points"] == 12.0
    assert ex1_v2["is_current"] is True

    # Create parallel variant (Fahrzeug)
    var_res = await client.post(
        f"/api/v1/exercises/{ex1_id}/new-variant",
        json={
            "name": "Typ1_Fahrzeug",
            "topic_tag": "_Vererbung",
            "latex_body": "\\begin{Aufgabe}[10] Fahrzeug \\BE \\end{Aufgabe}",
            "variant_key": "Fahrzeug",
        },
    )
    assert var_res.status_code == 201
    variant_ex = var_res.json()
    assert variant_ex["variant_key"] == "Fahrzeug"
    assert variant_ex["exercise_group_id"] == ex1["exercise_group_id"]

    # Check usage (should be 0 exams initially)
    usage_res = await client.get(f"/api/v1/exercises/{ex1_id}/usage")
    assert usage_res.status_code == 200
    assert usage_res.json()["exam_count"] == 0

    # Link exercise to an exam
    retention_date = (date.today() + timedelta(days=365)).isoformat()
    exam_res = await client.post(
        "/api/v1/exams",
        json={
            "title": "Exam with exercise",
            "retention_until": retention_date,
            "exercise_ids": [ex1_id],
        },
    )
    assert exam_res.status_code == 201

    # Check usage now (should be 1 exam)
    usage_res2 = await client.get(f"/api/v1/exercises/{ex1_id}/usage")
    assert usage_res2.status_code == 200
    assert usage_res2.json()["exam_count"] == 1
    assert usage_res2.json()["exams"][0]["title"] == "Exam with exercise"

    # Delete exercise
    del_res = await client.delete(f"/api/v1/exercises/{ex1_id}")
    assert del_res.status_code == 204

    # Get exercise should return 404
    get_res = await client.get(f"/api/v1/exercises/{ex1_id}")
    assert get_res.status_code == 404


@pytest.mark.asyncio
async def test_compile_endpoint_requires_auth(client: AsyncClient, db: AsyncSession) -> None:
    # Unauthenticated request fails with 401
    unauth_res = await client.post("/api/v1/compile/latex", json={"latex": "\\documentclass{article}"})
    assert unauth_res.status_code == 401

    # Authenticated request passes auth check
    await _create_teacher_and_login(client, db, "compileteacher@example.com")
    from unittest.mock import patch
    with patch("app.routers.compile.compile_latex", return_value=b"%PDF-1.4 fake"):
        auth_res = await client.post("/api/v1/compile/latex", json={"latex": "\\documentclass{article}"})
        assert auth_res.status_code == 200
        assert auth_res.content == b"%PDF-1.4 fake"


@pytest.mark.asyncio
async def test_exercise_and_exam_filtering(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "filterteacher@example.com")

    # Create exercises with different grade and subject tags
    await client.post(
        "/api/v1/exercises",
        json={
            "name": "Math_Ex_10",
            "topic_tag": "_Algebra",
            "grade": "10",
            "subject": "Mathematik",
            "latex_body": "Algebra Q \\BE",
        },
    )
    await client.post(
        "/api/v1/exercises",
        json={
            "name": "CS_Ex_12",
            "topic_tag": "_Vererbung",
            "grade": "12",
            "subject": "Informatik",
            "latex_body": "OOP Q \\BE",
        },
    )

    # Filter exercises by grade
    res_grade = await client.get("/api/v1/exercises?grade=10")
    assert res_grade.status_code == 200
    exs_grade = res_grade.json()
    assert len(exs_grade) == 1
    assert exs_grade[0]["name"] == "Math_Ex_10"
    assert exs_grade[0]["grade"] == "10"
    assert exs_grade[0]["subject"] == "Mathematik"

    # Filter exercises by subject
    res_subj = await client.get("/api/v1/exercises?subject=Informatik")
    assert res_subj.status_code == 200
    exs_subj = res_subj.json()
    assert len(exs_subj) == 1
    assert exs_subj[0]["name"] == "CS_Ex_12"

    # Search query matching grade/subject
    res_search = await client.get("/api/v1/exercises?search=Mathematik")
    assert res_search.status_code == 200
    assert len(res_search.json()) == 1

    # Create exams with grade and course (klasse) and subject (fach)
    retention_date = (date.today() + timedelta(days=365)).isoformat()
    await client.post(
        "/api/v1/exams",
        json={
            "title": "Math Exam 10a",
            "grade": "10",
            "klasse": "a",
            "fach": "Mathematik",
            "retention_until": retention_date,
        },
    )
    await client.post(
        "/api/v1/exams",
        json={
            "title": "CS Exam 12b",
            "grade": "12",
            "klasse": "b",
            "fach": "Informatik",
            "retention_until": retention_date,
        },
    )

    # Filter exams by grade (school year)
    res_exam_grade = await client.get("/api/v1/exams?grade=10")
    assert res_exam_grade.status_code == 200
    assert len(res_exam_grade.json()) == 1
    assert res_exam_grade.json()[0]["title"] == "Math Exam 10a"
    assert res_exam_grade.json()[0]["grade"] == "10"
    assert res_exam_grade.json()[0]["klasse"] == "a"


@pytest.mark.asyncio
async def test_update_exam_metadata_patch_repeatedly(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "patcheditor@example.com")
    retention_date = (date.today() + timedelta(days=365)).isoformat()
    exam_id = str(uuid.uuid4())

    # Create exam initially
    res_create = await client.post(
        "/api/v1/exams",
        json={
            "id": exam_id,
            "title": "Original Exam Title",
            "grade": "10",
            "klasse": "a",
            "retention_until": retention_date,
        },
    )
    assert res_create.status_code == 201

    # PATCH metadata twice in succession
    res_patch_1 = await client.patch(
        f"/api/v1/exams/{exam_id}",
        json={
            "title": "Updated Exam Title",
            "grade": "10",
            "klasse": "b",
        },
    )
    assert res_patch_1.status_code == 200
    assert res_patch_1.json()["title"] == "Updated Exam Title"
    assert res_patch_1.json()["klasse"] == "b"

    res_patch_2 = await client.patch(
        f"/api/v1/exams/{exam_id}",
        json={
            "title": "Updated Exam Title 2",
            "grade": "11",
            "klasse": "c",
        },
    )
    assert res_patch_2.status_code == 200
    assert res_patch_2.json()["title"] == "Updated Exam Title 2"
    assert res_patch_2.json()["grade"] == "11"


@pytest.mark.asyncio
async def test_exam_mc_group_creation_and_compilation(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "mcteacher@example.com")

    retention_date = (date.today() + timedelta(days=365)).isoformat()
    group_id = str(uuid.uuid4())

    # Create exam with MC group and inline grouped exercises
    resp = await client.post(
        "/api/v1/exams",
        json={
            "title": "MC Exam Test",
            "retention_until": retention_date,
            "mc_groups": [
                {
                    "id": group_id,
                    "title": "Grundlagen MC",
                    "scoring_text": "1BE per correct choice",
                    "order_index": 1,
                }
            ],
            "exercises": [
                {
                    "name": "MC Question A",
                    "latex_body": "Option A1 \\Lmulti{A2}",
                    "max_points": 1.0,
                    "question_type": "mc",
                    "mc_group_id": group_id,
                    "sub_index": 1,
                },
                {
                    "name": "MC Question B",
                    "latex_body": "Option B1 \\Lmulti{B2}",
                    "max_points": 1.0,
                    "question_type": "mc",
                    "mc_group_id": group_id,
                    "sub_index": 2,
                },
            ],
        },
    )
    assert resp.status_code == 201
    exam = resp.json()
    exam_id = exam["id"]
    assert len(exam["mc_groups"]) == 1
    assert exam["mc_groups"][0]["title"] == "Grundlagen MC"
    assert len(exam["mc_groups"][0]["member_ids"]) == 2
    assert exam["exercises"][0]["id"] in exam["mc_groups"][0]["member_ids"]
    assert exam["exercises"][1]["id"] in exam["mc_groups"][0]["member_ids"]
    assert len(exam["exercises"]) == 2
    assert exam["exercises"][0]["mc_group_id"] is not None

    # Retrieve exam by ID
    get_resp = await client.get(f"/api/v1/exams/{exam_id}")
    assert get_resp.status_code == 200
    fetched_exam = get_resp.json()
    assert len(fetched_exam["mc_groups"]) == 1
    assert fetched_exam["mc_groups"][0]["title"] == "Grundlagen MC"
    assert len(fetched_exam["mc_groups"][0]["member_ids"]) == 2
    assert fetched_exam["exercises"][0]["id"] in fetched_exam["mc_groups"][0]["member_ids"]
    assert fetched_exam["exercises"][1]["id"] in fetched_exam["mc_groups"][0]["member_ids"]

    # Test PDF compile endpoint mock
    with patch("app.routers.exams.compile_exam_latex", return_value=b"%PDF-1.4 mc_test"):
        compile_resp = await client.post(f"/api/v1/exams/{exam_id}/compile")
        assert compile_resp.status_code == 200
        assert compile_resp.content == b"%PDF-1.4 mc_test"


@pytest.mark.asyncio
async def test_exercise_usage_and_deletion(client: AsyncClient, db: AsyncSession) -> None:
    await _create_teacher_and_login(client, db, "usageteacher@example.com")

    # Create an exercise
    create_res = await client.post(
        "/api/v1/exercises",
        json={
            "name": "DeleteTestEx",
            "topic_tag": "Test",
            "grade": "11",
            "subject": "Physik",
            "latex_body": "Physik Frage \\BE",
        },
    )
    assert create_res.status_code == 201
    ex_id = create_res.json()["id"]

    # Check usage endpoint
    usage_res = await client.get(f"/api/v1/exercises/{ex_id}/usage")
    assert usage_res.status_code == 200
    usage_data = usage_res.json()
    assert usage_data["exam_count"] == 0
    assert usage_data["exams"] == []

    # Delete exercise
    del_res = await client.delete(f"/api/v1/exercises/{ex_id}")
    assert del_res.status_code == 240 or del_res.status_code == 204

    # Verify exercise is gone
    get_res = await client.get(f"/api/v1/exercises/{ex_id}")
    assert get_res.status_code == 404


@pytest.mark.asyncio
async def test_cors_preflight_origins(client: AsyncClient) -> None:
    """
    Preflight must reflect whatever origin allowlist is configured.

    Driven off `settings` rather than hardcoded production hostnames: CI narrows
    CORS_ALLOWED_ORIGINS to localhost, so asserting against examance.pages.dev
    made the test depend on ambient configuration rather than on behaviour.
    """
    from app.config import settings

    allowed = settings.CORS_ALLOWED_ORIGINS[0]

    # 1. An explicitly allowlisted origin is echoed back.
    resp = await client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": allowed,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == allowed

    # 2. An origin matching effective_cors_origin_regex, when one is configured.
    if settings.effective_cors_origin_regex:
        resp_sub = await client.options(
            "/api/v1/auth/login",
            headers={
                "Origin": "https://sub.valentin-herrmann.com",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert resp_sub.status_code == 200
        assert (
            resp_sub.headers.get("access-control-allow-origin")
            == "https://sub.valentin-herrmann.com"
        )

    # 3. An unlisted origin is never echoed back.
    resp_unauth = await client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "https://unauthorized-domain.com",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert resp_unauth.headers.get("access-control-allow-origin") is None

    # 4. The regex must not be suffix-extendable.
    resp_suffix = await client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "https://sub.valentin-herrmann.com.attacker.test",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert resp_suffix.headers.get("access-control-allow-origin") is None


async def test_list_student_identities(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    """GET /api/v1/exams/{exam_id}/students returns student identities for an exam."""
    await _create_teacher_and_login(client, db, "studentteacher1@example.com")

    retention_date = (date.today() + timedelta(days=365)).isoformat()
    exam_resp = await client.post(
        "/api/v1/exams",
        json={"title": "Student List Exam", "retention_until": retention_date},
    )
    assert exam_resp.status_code == 201
    exam_id = exam_resp.json()["id"]

    # GET students list should be empty
    list_resp = await client.get(f"/api/v1/exams/{exam_id}/students")
    assert list_resp.status_code == 200
    assert list_resp.json() == []

    # POST a student identity
    pseudonym_hmac = secrets.token_hex(32)
    st_resp = await client.post(
        f"/api/v1/exams/{exam_id}/students",
        json={
            "pseudonym_hmac": pseudonym_hmac,
            "pii_ciphertext_b64": base64.b64encode(b"fake-encrypted-pii").decode(),
            "iv_b64": base64.b64encode(secrets.token_bytes(12)).decode(),
            "encryption_salt_b64": base64.b64encode(secrets.token_bytes(16)).decode(),
        },
    )
    assert st_resp.status_code == 201

    # GET students list should now have 1 entry
    list_resp = await client.get(f"/api/v1/exams/{exam_id}/students")
    assert list_resp.status_code == 200
    students = list_resp.json()
    assert len(students) == 1
    assert students[0]["pseudonym_hmac"] == pseudonym_hmac

    # Different teacher should get 401 (ownership check — never leak resource existence)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://test") as client2:
        await _create_teacher_and_login(client2, db, "studentteacher2@example.com")
        list_resp2 = await client2.get(f"/api/v1/exams/{exam_id}/students")
        assert list_resp2.status_code == 401


async def test_create_exam_wrong_method(
    client: AsyncClient,
    db: AsyncSession,
) -> None:
    """POST /api/v1/exams/{exam_id}/students returns 401 if exam_id is not found or owned by another."""
    await _create_teacher_and_login(client, db, "studentteacher3@example.com")

    retention_date = (date.today() + timedelta(days=365)).isoformat()
    exam_resp = await client.post(
        "/api/v1/exams",
        json={"title": "Student List Exam", "retention_until": retention_date},
    )
    assert exam_resp.status_code == 201
    exam_id = exam_resp.json()["id"]

    # POST a student identity
    pseudonym_hmac = secrets.token_hex(32)
    st_resp = await client.post(
        f"/api/v1/exams/{exam_id}/students",
        json={
            "pseudonym_hmac": pseudonym_hmac,
            "pii_ciphertext_b64": base64.b64encode(b"fake-encrypted-pii").decode(),
            "iv_b64": base64.b64encode(secrets.token_bytes(12)).decode(),
            "encryption_salt_b64": base64.b64encode(secrets.token_bytes(16)).decode(),
        },
    )
    assert st_resp.status_code == 201

    # POST a student identity to a non-existent exam
    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://test") as client2:
        await _create_teacher_and_login(client2, db, "studentteacher4@example.com")
        st_resp2 = await client2.post(
            "/api/v1/exams/00000000-0000-0000-0000-000000000000/students",
            json={
                "pseudonym_hmac": pseudonym_hmac,
                "pii_ciphertext_b64": base64.b64encode(b"fake-encrypted-pii").decode(),
                "iv_b64": base64.b64encode(secrets.token_bytes(12)).decode(),
                "encryption_salt_b64": base64.b64encode(secrets.token_bytes(16)).decode(),
            },
        )
        assert st_resp2.status_code == 401


def test_export_openapi_cli(tmp_path: Path) -> None:
    """CLI export-openapi command dumps valid OpenAPI 3.0 specification JSON."""
    import json

    from click.testing import CliRunner

    from app.cli import cli

    out_file = tmp_path / "openapi.json"
    runner = CliRunner()
    result = runner.invoke(cli, ["export-openapi", "--output", str(out_file)])

    assert result.exit_code == 0
    assert "Exported OpenAPI specification" in result.output
    assert out_file.exists()

    content = json.loads(out_file.read_text(encoding="utf-8"))
    assert content["info"]["title"] == "Examance API"
    assert "/api/v1/auth/login" in content["paths"]





