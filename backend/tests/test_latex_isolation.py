"""Tectonic reads any file its user may read, so it must never inherit the server's secrets."""
from __future__ import annotations

import pytest

from app.services import latex


def test_the_compiler_environment_holds_no_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SECRET_KEY", "x" * 64)
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:pw@db/app")
    monkeypatch.setenv("SMTP_PASSWORD", "mail-secret")
    monkeypatch.setenv("TECTONIC_CACHE_DIR", "/var/cache/tectonic")
    monkeypatch.setenv("PATH", "/usr/local/bin:/usr/bin:/bin")

    env = latex._child_env()

    assert env["TECTONIC_CACHE_DIR"] == "/var/cache/tectonic"
    assert env["PATH"] == "/usr/local/bin:/usr/bin:/bin"
    assert set(env) <= set(latex._CHILD_ENV_KEYS)
    assert not {"SECRET_KEY", "DATABASE_URL", "SMTP_PASSWORD"} & set(env)
