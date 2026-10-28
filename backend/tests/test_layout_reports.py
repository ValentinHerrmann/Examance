"""Layout reports (issue #134): what the admin inbox serves back."""
from __future__ import annotations

import base64
import uuid
from urllib.parse import unquote

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from .factors import sign_in, unique_email

pytestmark = pytest.mark.asyncio

REPORTS = "/api/v1/layout-reports"
INBOX = "/api/v1/admin/layout-reports"


async def _download(client_factory, db: AsyncSession, filename: str):
    teacher, admin = await client_factory(2)
    await sign_in(teacher, db, unique_email("reporter"))
    await sign_in(admin, db, unique_email("inbox"), role="admin")
    sent = await teacher.post(
        REPORTS,
        json={
            "source_kind": "exam",
            "engine": "browser",
            "problem": f"Layout broken {uuid.uuid4().hex[:6]}",
            "expected": "Fine",
            "files": [
                {
                    "filename": filename,
                    "mime_type": "application/pdf",
                    "content_b64": base64.b64encode(b"%PDF-1.4").decode(),
                }
            ],
        },
    )
    assert sent.status_code == 204, sent.text
    listed = (await admin.get(INBOX)).json()["items"]
    report_id = listed[0]["id"]
    detail = (await admin.get(f"{INBOX}/{report_id}")).json()
    file_id = detail["files"][0]["id"]
    return await admin.get(f"{INBOX}/{report_id}/files/{file_id}")


async def test_non_ascii_file_name_is_sent_as_rfc5987(client_factory, db: AsyncSession) -> None:
    resp = await _download(client_factory, db, "Prüfung ✓ Übung.pdf")

    # A raw non-latin-1 name used to crash the header encoder (a 500).
    assert resp.status_code == 200, resp.text
    disposition = resp.headers["content-disposition"]
    ascii_part, _, extended = disposition.partition("; filename*=UTF-8''")
    assert ascii_part.startswith('inline; filename="')
    assert ascii_part.isascii()
    assert unquote(extended) == "Prüfung ✓ Übung.pdf"


async def test_plain_file_name_header_is_unchanged(client_factory, db: AsyncSession) -> None:
    resp = await _download(client_factory, db, "exam-1.pdf")

    assert resp.status_code == 200, resp.text
    assert resp.headers["content-disposition"] == 'inline; filename="exam-1.pdf"'
