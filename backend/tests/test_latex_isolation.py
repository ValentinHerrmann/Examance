"""TeX reads any file its user may read outside our texmf.cnf rules, so it must never inherit the server's secrets."""
from __future__ import annotations

import pytest

from app.services import texrunner


def test_the_compiler_environment_holds_no_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SECRET_KEY", "x" * 64)
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:pw@db/app")
    monkeypatch.setenv("SMTP_PASSWORD", "mail-secret")
    monkeypatch.setenv("HTTPS_PROXY", "http://proxy:3128")
    monkeypatch.setenv("PATH", "/usr/local/bin:/usr/bin:/bin")

    env = texrunner._child_env()

    assert env["PATH"] == "/usr/local/bin:/usr/bin:/bin"
    # Our locked-down texmf.cnf comes first; the distribution's defaults follow (trailing colon).
    assert env["TEXMFCNF"] == f"{texrunner.CONFIG_DIR}:"
    assert env["TEXFORMATS"] == f"{texrunner.FORMAT_DIR}:"
    assert set(env) <= set(texrunner._CHILD_ENV_KEYS) | {"TEXMFCNF", "TEXFORMATS"}
    # TeX Live needs no network: no proxy, and no secret of any kind.
    assert not {"SECRET_KEY", "DATABASE_URL", "SMTP_PASSWORD", "HTTPS_PROXY"} & set(env)


def test_the_texmf_cnf_locks_documents_in() -> None:
    cnf = (texrunner.CONFIG_DIR / "texmf.cnf").read_text(encoding="utf-8")
    for setting in ("shell_escape = f", "openin_any = p", "openout_any = p"):
        assert setting in cnf
