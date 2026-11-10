"""The app lifespan releases the database engine even when the server exits through an exception (SonarCloud S9152)."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI

from app import database, main
from app.services import bootstrap, ephemeral_store, latex


class _Session:
    async def __aenter__(self) -> _Session:
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None


async def test_engine_disposed_after_exception(monkeypatch: pytest.MonkeyPatch) -> None:
    disposed: list[bool] = []

    async def dispose() -> None:
        disposed.append(True)

    async def no_admin(_session: Any) -> None:
        return None

    # Startup side effects that must not touch the pytest process or a real database.
    monkeypatch.setattr(latex, "forbid_environ_reads", lambda: None)
    monkeypatch.setattr(bootstrap, "create_initial_admin", no_admin)
    monkeypatch.setattr(ephemeral_store, "uses_redis", lambda: False)
    monkeypatch.setattr(main.blob_store, "configured", lambda: False)
    monkeypatch.setattr(database, "AsyncSessionLocal", _Session)
    monkeypatch.setattr(database, "engine", SimpleNamespace(dispose=dispose))

    with pytest.raises(RuntimeError):
        async with main.lifespan(FastAPI()):
            raise RuntimeError("server loop aborted")
    assert disposed == [True]
