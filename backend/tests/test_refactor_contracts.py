"""Behaviour of the exam/exercise/submission routes that shared helpers now produce. Pins what the hand-written per-route code did: null handling of PATCH, the fields a duplicate copies, what an exam embeds of an exercise, group cascades and the upload size rules."""
from __future__ import annotations

import base64
import uuid
from datetime import date, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.blob_validation import (
    UploadRejected,
    UploadTooLarge,
    check_upload,
    upload_http_error,
)
from app.services.latex_resources import MAX_RESOURCE_BYTES, ResourceError, validate_resource
from app.services.logo import LogoError, decode_logo

from .factors import sign_in

EXAMS = "/api/v1/exams"
EXERCISES = "/api/v1/exercises"
RETENTION = (date.today() + timedelta(days=30)).isoformat()


async def _exam(client: AsyncClient, **extra: Any) -> dict[str, Any]:
    resp = await client.post(
        EXAMS, json={"title": "Original", "retention_until": RETENTION, **extra}
    )
    assert resp.status_code == 201, resp.text
    return dict(resp.json())


@pytest.mark.asyncio
async def test_exam_patch_null_keeps_plain_columns_but_clears_the_topic(
    client: AsyncClient, db: AsyncSession
) -> None:
    await sign_in(client, db, "patch-null@example.com")
    exam = await _exam(
        client,
        grade="7",
        klasse="7a",
        topic="Optik",
        info_text="note",
        grading_key={"a": 1},
        name_line=True,
    )
    url = f"{EXAMS}/{exam['id']}"
    nulls = dict.fromkeys(
        ("title", "latex_template", "grade", "klasse", "info_text", "grading_key", "name_line")
    )

    body = (await client.patch(url, json={**nulls, "topic": None})).json()
    assert (body["title"], body["grade"], body["klasse"]) == ("Original", "7", "7a")
    assert (body["info_text"], body["grading_key"], body["name_line"]) == ("note", {"a": 1}, True)
    assert body["topic"] is None  # null (or blank) clears the topic

    # Falsy values are values, and a field that is not sent stays as it was.
    body = (
        await client.patch(url, json={"info_text": "", "name_line": False, "grading_key": {}})
    ).json()
    assert (body["info_text"], body["name_line"], body["grading_key"]) == ("", False, {})
    assert (body["grade"], body["klasse"]) == ("7", "7a")


@pytest.mark.asyncio
async def test_exam_patch_clears_the_special_columns_only_when_sent(
    client: AsyncClient, db: AsyncSession
) -> None:
    await sign_in(client, db, "patch-special@example.com")
    notes = {"title": "Zusatz", "description": "", "min_height_cm": 2.0, "max_height_cm": 5.0}
    exam = await _exam(
        client,
        page_breaks=["a", "b"],
        extra_notes=notes,
        latex_packages=[{"kind": "package", "name": "siunitx", "options": "", "disabled": False}],
    )
    url = f"{EXAMS}/{exam['id']}"

    untouched = (await client.patch(url, json={"nr": "2"})).json()
    assert untouched["page_breaks"] == ["a", "b"]
    assert untouched["extra_notes"] == notes
    assert [p["name"] for p in untouched["latex_packages"]] == ["siunitx"]

    cleared = (
        await client.patch(
            url, json={"page_breaks": [], "extra_notes": None, "latex_packages": None}
        )
    ).json()
    assert (cleared["page_breaks"], cleared["extra_notes"], cleared["latex_packages"]) == (
        None,
        None,
        None,
    )


@pytest.mark.asyncio
async def test_exam_duplicate_copies_every_header_field(
    client: AsyncClient, db: AsyncSession
) -> None:
    await sign_in(client, db, "dup-fields@example.com")
    notes = {"title": "Zusatz", "description": "d", "min_height_cm": 2.0, "max_height_cm": 5.0}
    exam = await _exam(
        client,
        latex_template="\\documentclass{article}",
        testart="KA",
        grade="7",
        klasse="7a",
        datum="1.1.2026",
        nr="3",
        fach="Physik",
        topic="Optik",
        lehrernachname="Muster",
        info_text="note",
        grading_key={"a": [1, 2]},
        name_line=True,
        extra_notes=notes,
        latex_packages=[{"kind": "package", "name": "siunitx", "options": "", "disabled": False}],
    )
    resp = await client.post(f"{EXAMS}/{exam['id']}/duplicate", json={"retention_until": RETENTION})
    assert resp.status_code == 201, resp.text
    copy = resp.json()

    assert copy["id"] != exam["id"]
    assert copy["title"] == "Original (Kopie)"
    skipped = {"id", "title", "created_at", "exercises", "mc_groups"}
    assert {k: v for k, v in copy.items() if k not in skipped} == {
        k: v for k, v in exam.items() if k not in skipped
    }


@pytest.mark.asyncio
async def test_exam_embeds_exercises_without_share_state(
    client: AsyncClient, db: AsyncSession
) -> None:
    await sign_in(client, db, "embed@example.com")
    ex = (await client.post(EXERCISES, json={"name": "Aufgabe", "latex_body": "\\BE x"})).json()
    shared = await client.put(f"{EXERCISES}/{ex['id']}/sharing", json={"shared": True})
    assert shared.status_code == 200, shared.text
    assert shared.json()[0]["is_shared"] is True

    exam = await _exam(client, exercise_links=[{"exercise_id": ex["id"], "order_index": 4}])
    embedded = (await client.get(f"{EXAMS}/{exam['id']}")).json()["exercises"][0]
    assert (embedded["order_index"], embedded["mc_group_id"], embedded["sub_index"]) == (
        4,
        None,
        None,
    )
    assert (embedded["is_shared"], embedded["shared_at"]) == (False, None)
    assert embedded["copied_from_exercise_id"] is None
    listed = (await client.get(f"{EXAMS}/{exam['id']}/exercises")).json()
    assert listed == [embedded]


@pytest.mark.asyncio
async def test_exercise_patch_null_keeps_values_and_cascades_group_metadata(
    client: AsyncClient, db: AsyncSession
) -> None:
    await sign_in(client, db, "ex-patch@example.com")
    first = (
        await client.post(
            EXERCISES, json={"name": "Brüche", "latex_body": "\\BE a", "grade": "6"}
        )
    ).json()
    sister = (
        await client.post(
            f"{EXERCISES}/{first['id']}/new-variant",
            json={"latex_body": "\\BE b", "variant_key": "B"},
        )
    ).json()

    patched = await client.patch(
        f"{EXERCISES}/{first['id']}",
        json={"name": "Dezimalzahlen", "grade": None, "topic_tag": "Zahlen", "penalty": None},
    )
    assert patched.status_code == 200, patched.text
    assert (patched.json()["name"], patched.json()["grade"]) == ("Dezimalzahlen", "6")

    # The group and every variant follow the metadata; the other variant's content stays.
    other = (await client.get(f"{EXERCISES}/{sister['id']}")).json()
    assert (other["name"], other["topic_tag"], other["grade"]) == ("Dezimalzahlen", "Zahlen", "6")
    assert other["latex_body"] == "\\BE b"

    group = await client.patch(
        f"{EXERCISES}/groups/{first['exercise_group_id']}", json={"subject": "Mathe", "name": None}
    )
    assert group.status_code == 200, group.text
    assert (group.json()["name"], group.json()["subject"]) == ("Dezimalzahlen", "Mathe")
    assert (await client.get(f"{EXERCISES}/{sister['id']}")).json()["subject"] == "Mathe"
    missing = await client.patch(f"{EXERCISES}/groups/{uuid.uuid4()}", json={"name": "x"})
    assert missing.status_code == 404


async def _call(client: AsyncClient, method: str, url: str) -> Any:
    body = {"json": {"total_score": 1}} if method == "patch" else {}
    return await getattr(client, method)(url, **body)


@pytest.mark.asyncio
async def test_submission_routes_hide_foreign_and_deleted_submissions(
    client_factory, db: AsyncSession
) -> None:
    owner, other = await client_factory(2)
    await sign_in(owner, db, "sub-owner@example.com")
    await sign_in(other, db, "sub-other@example.com")
    exam = await _exam(owner)
    base = f"{EXAMS}/{exam['id']}/submissions"
    pseudonym = "a" * 64
    await owner.post(
        f"{EXAMS}/{exam['id']}/students",
        json={
            "pseudonym_hmac": pseudonym,
            "pii_ciphertext_b64": base64.b64encode(b"pii").decode(),
            "iv_b64": base64.b64encode(b"0" * 12).decode(),
            "encryption_salt_b64": base64.b64encode(b"1" * 16).decode(),
        },
    )
    # Without a scan the stored IV is empty: GET answers "" for it, the score route null.
    made = await owner.post(base, json={"pseudonym_hmac": pseudonym})
    assert made.status_code == 201, made.text
    sub_id = made.json()["id"]
    assert (made.json()["has_scan"], made.json()["scan_iv_b64"]) == (False, None)

    got = (await owner.get(f"{base}/{sub_id}")).json()
    assert (got["scan_iv_b64"], got["scan_ciphertext_b64"], got["has_scan"]) == ("", None, False)
    scored = await owner.patch(f"{base}/{sub_id}/score", json={"total_score": 7.5})
    assert scored.json()["total_score"] == 7.5
    assert scored.json()["scan_iv_b64"] is None

    foreign = f"{EXAMS}/{exam['id']}/submissions/{sub_id}"
    for method, url in (("get", foreign), ("patch", f"{foreign}/score"), ("delete", foreign)):
        resp = await _call(other, method, url)
        assert resp.status_code == 404, (method, resp.text)
        assert resp.headers.get("code") == "ERR_EXAM_NOT_FOUND"

    assert (await owner.delete(foreign)).status_code == 204
    for method, url in (
        ("get", foreign),
        ("patch", f"{foreign}/score"),
        ("delete", foreign),
        ("delete", f"{foreign}/grading"),
    ):
        resp = await _call(owner, method, url)
        assert resp.status_code == 404, (method, resp.text)
        assert resp.json()["detail"] == "Submission not found."


@pytest.mark.asyncio
async def test_resource_upload_size_rules_keep_their_codes(
    client: AsyncClient, db: AsyncSession
) -> None:
    await sign_in(client, db, "res-size@example.com")
    ex = (await client.post(EXERCISES, json={"name": "A", "latex_body": "\\BE x"})).json()
    url = f"{EXERCISES}/{ex['id']}/resources"

    empty = await client.post(url, json={"filename": "e.png", "content_b64": ""})
    assert empty.status_code == 400
    assert "code" not in empty.headers

    too_big = base64.b64encode(b"x" * (MAX_RESOURCE_BYTES + 1)).decode()
    big = await client.post(url, json={"filename": "big.png", "content_b64": too_big})
    assert big.status_code == 413
    assert big.headers["code"] == "ERR_PAYLOAD_TOO_LARGE"

    ok = await client.post(url, json={"filename": "ok.png", "content_b64": "aGk="})
    assert ok.status_code == 201, ok.text


def test_check_upload_rejects_empty_and_oversized_content() -> None:
    check_upload(b"x", 1, "The file")
    with pytest.raises(UploadRejected, match="The file is empty"):
        check_upload(b"", 1, "The file")
    with pytest.raises(UploadTooLarge, match="larger than 2 MB"):
        check_upload(b"x" * (2 * 1024 * 1024 + 1), 2 * 1024 * 1024, "The file")

    assert upload_http_error(UploadRejected("empty")).status_code == 400
    too_large = upload_http_error(UploadTooLarge("big"))
    assert (too_large.status_code, too_large.headers) == (413, {"code": "ERR_PAYLOAD_TOO_LARGE"})


def test_callers_keep_their_own_exception_types() -> None:
    with pytest.raises(LogoError):
        decode_logo("")
    with pytest.raises(LogoError, match="larger than 2 MB"):
        decode_logo(base64.b64encode(b"%PDF-" + b"x" * (2 * 1024 * 1024)).decode())
    with pytest.raises(ResourceError, match="'a.png' is empty"):
        validate_resource("a.png", b"")
    with pytest.raises(ResourceError, match="'a.png' is larger than 5 MB"):
        validate_resource("a.png", b"x" * (MAX_RESOURCE_BYTES + 1))
