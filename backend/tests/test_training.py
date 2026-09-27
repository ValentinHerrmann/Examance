"""Opt-in OMR training-data donation: public, anonymous, strictly validated."""
from __future__ import annotations

import base64
from typing import Any
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.omr_training_sample import OmrTrainingSample
from app.schemas.training import OMR_CROP_BYTES

URL = "/api/v1/training/omr-samples"


def _sample(**overrides: Any) -> dict[str, Any]:
    sample: dict[str, Any] = {
        "schema_version": 1,
        "algorithm_version": 3,
        "label_selected": True,
        "detected_state": "ambiguous",
        "provisional": True,
        "reasons": ["thin"],
        "has_redo_zone": True,
        "crop_b64": base64.b64encode(bytes(OMR_CROP_BYTES)).decode("ascii"),
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


@pytest.mark.asyncio
async def test_status_is_public(client: AsyncClient) -> None:
    res = await client.get("/api/v1/training/status")
    assert res.status_code == 200
    assert res.json() == {"enabled": settings.TRAINING_DONATION_ENABLED}


@pytest.mark.asyncio
async def test_donation_stores_anonymous_rows(client: AsyncClient, db: AsyncSession) -> None:
    res = await client.post(URL, json={"samples": [_sample(), _sample(label_selected=False)]})
    assert res.status_code == 204

    rows = (await db.execute(select(OmrTrainingSample))).scalars().all()
    assert len(rows) >= 2
    for row in rows:
        assert len(row.crop) == OMR_CROP_BYTES
        assert set(row.meta) == {
            "detected_state", "provisional", "alt_state", "reasons", "has_redo_zone", "features",
        }


@pytest.mark.asyncio
async def test_rejects_unknown_fields(client: AsyncClient) -> None:
    # Nothing outside the schema — least of all an identifier — may be stored.
    res = await client.post(URL, json={"samples": [_sample(submission_id="abc")]})
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_rejects_wrong_crop_size(client: AsyncClient) -> None:
    bad = base64.b64encode(bytes(OMR_CROP_BYTES - 1)).decode("ascii")
    res = await client.post(URL, json={"samples": [_sample(crop_b64=bad)]})
    assert res.status_code == 400


@pytest.mark.asyncio
async def test_rejects_out_of_range_features(client: AsyncClient) -> None:
    sample = _sample()
    sample["features"]["fill"] = 3.0
    res = await client.post(URL, json={"samples": [sample]})
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_never_answers_401(client: AsyncClient) -> None:
    # No session cookie at all: a 401 would make the client start a token refresh.
    res = await client.post(URL, json={"samples": [_sample()]})
    assert res.status_code != 401


@pytest.mark.asyncio
async def test_kill_switch(client: AsyncClient) -> None:
    with patch.object(settings, "TRAINING_DONATION_ENABLED", False):
        res = await client.post(URL, json={"samples": [_sample()]})
        assert res.status_code == 404
        status_res = await client.get("/api/v1/training/status")
        assert status_res.json() == {"enabled": False}
