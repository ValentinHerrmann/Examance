"""Opt-in OMR training-data donation: signed-in only, unlinked at rest, strictly validated."""
from __future__ import annotations

import base64
import uuid
from typing import Any
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.omr_training_sample import OmrTrainingSample
from app.schemas.training import OMR_CROP_BYTES
from app.services.jwt import create_access_token

from .factors import create_teacher, sign_in

URL = "/api/v1/training/omr-samples"


def _email() -> str:
    return f"donor-{uuid.uuid4().hex[:8]}@example.com"


def _sample(**overrides: Any) -> dict[str, Any]:
    sample: dict[str, Any] = {
        "schema_version": 1,
        "algorithm_version": 4,
        "label_selected": True,
        "detected_state": "ambiguous",
        "provisional": True,
        "reasons": ["thin"],
        "has_redo_zone": True,
        "crop_b64": base64.b64encode(bytes(OMR_CROP_BYTES)).decode("ascii"),
        "sample_token": str(uuid.uuid4()),
        "features": {
            "fill": 0.1,
            "redo_ratio": 0.0,
            "min_cell_fill": 0.0,
            "cell_evenness": 0.0,
            "ring_fill": 0.01,
            "spill_excess": 0.0,
            "ink_contrast": 0.8,
            "stroke_span": 0.5,
            "stroke_frac": 0.04,
            "redo_near_frac": 0.0,
            "snap_dx": 0.0,
            "snap_dy": -0.13,
            "border_found": True,
            "bg": 248,
        },
    }
    sample.update(overrides)
    return sample


async def _rows_for(db: AsyncSession, *tokens: str) -> list[OmrTrainingSample]:
    ids = [uuid.UUID(t) for t in tokens]
    res = await db.execute(select(OmrTrainingSample).where(OmrTrainingSample.sample_token.in_(ids)))
    return list(res.scalars().all())


@pytest.mark.asyncio
async def test_status_is_public(client: AsyncClient) -> None:
    res = await client.get("/api/v1/training/status")
    assert res.status_code == 200
    assert res.json() == {
        "enabled": settings.TRAINING_DONATION_ENABLED,
        "retention_days": settings.TRAINING_SAMPLE_RETENTION_DAYS,
    }


@pytest.mark.asyncio
async def test_requires_a_session(client: AsyncClient) -> None:
    res = await client.post(URL, json={"samples": [_sample()]})
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_rejects_a_half_finished_sign_in(client: AsyncClient, db: AsyncSession) -> None:
    teacher = await create_teacher(db, _email())
    token = create_access_token(teacher.id, teacher.email, teacher.role, scope="auth_pending")
    client.cookies.set("access_token", token)
    res = await client.post(URL, json={"samples": [_sample()]})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_donation_stores_unlinked_rows(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, _email())
    a, b = _sample(), _sample(label_selected=False)
    res = await client.post(URL, json={"samples": [a, b]})
    assert res.status_code == 204

    rows = await _rows_for(db, a["sample_token"], b["sample_token"])
    assert len(rows) == 2
    for row in rows:
        assert len(row.crop) == OMR_CROP_BYTES
        assert set(row.meta) == {
            "detected_state", "provisional", "alt_state", "reasons", "has_redo_zone", "features",
        }
    # Nothing that could name the donor.
    assert set(OmrTrainingSample.__table__.columns.keys()) == {
        "id", "sample_token", "created_on", "schema_version", "algorithm_version",
        "label_selected", "crop_width", "crop_height", "crop", "meta",
    }


@pytest.mark.asyncio
async def test_same_token_replaces_the_earlier_label(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, _email())
    first = _sample(label_selected=True)
    assert (await client.post(URL, json={"samples": [first]})).status_code == 204
    corrected = _sample(label_selected=False, sample_token=first["sample_token"])
    assert (await client.post(URL, json={"samples": [corrected]})).status_code == 204

    rows = await _rows_for(db, first["sample_token"])
    assert len(rows) == 1
    assert rows[0].label_selected is False


@pytest.mark.asyncio
async def test_rejects_duplicate_tokens_in_one_batch(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, _email())
    s = _sample()
    res = await client.post(URL, json={"samples": [s, _sample(sample_token=s["sample_token"])]})
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_rejects_unknown_fields(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, _email())
    # Nothing outside the schema — least of all an identifier — may be stored.
    res = await client.post(URL, json={"samples": [_sample(submission_id="abc")]})
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_rejects_wrong_crop_size(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, _email())
    bad = base64.b64encode(bytes(OMR_CROP_BYTES - 1)).decode("ascii")
    res = await client.post(URL, json={"samples": [_sample(crop_b64=bad)]})
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_rejects_out_of_range_features(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, _email())
    sample = _sample()
    sample["features"]["fill"] = 3.0
    res = await client.post(URL, json={"samples": [sample]})
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_per_account_quota(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, _email())
    with patch.object(settings, "TRAINING_SAMPLES_PER_TEACHER_PER_DAY", 2):
        assert (await client.post(URL, json={"samples": [_sample()]})).status_code == 204
        res = await client.post(URL, json={"samples": [_sample(), _sample()]})
    assert res.status_code == 429
    # A Retry-After would make the client start its *login* lockout.
    assert "retry-after" not in res.headers
    assert res.headers.get("code") == "ERR_TRAINING_QUOTA"


@pytest.mark.asyncio
async def test_global_daily_cap(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, _email())
    with patch.object(settings, "TRAINING_SAMPLES_PER_DAY_MAX", 0):
        res = await client.post(URL, json={"samples": [_sample()]})
    assert res.status_code == 429
    assert "retry-after" not in res.headers


@pytest.mark.asyncio
async def test_kill_switch(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, _email())
    with patch.object(settings, "TRAINING_DONATION_ENABLED", False):
        res = await client.post(URL, json={"samples": [_sample()]})
        assert res.status_code == 404
        status_res = await client.get("/api/v1/training/status")
        assert status_res.json()["enabled"] is False
