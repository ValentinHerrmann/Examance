"""Mail connections check the server's certificate and host name (issue #286)."""
from __future__ import annotations

import imaplib
import smtplib
import ssl
from typing import Any

import pytest

from app.config import settings
from app.services import bounces
from app.services import email as email_svc


def _assert_verifying(context: Any) -> None:
    assert isinstance(context, ssl.SSLContext)
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname is True


def test_starttls_gets_a_verifying_context(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, Any] = {}

    class FakeSMTP:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            pass

        def __enter__(self) -> FakeSMTP:
            return self

        def __exit__(self, *exc: object) -> None:
            return None

        def starttls(self, context: ssl.SSLContext | None = None) -> None:
            seen["context"] = context

        def login(self, *args: Any) -> None:
            pass

        def send_message(self, msg: Any) -> None:
            pass

    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "SMTP_USE_TLS", True)
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)

    assert email_svc._send_sync("a@school.example", "Subject", "Body") is True
    _assert_verifying(seen["context"])


def test_imap_gets_a_verifying_context(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, Any] = {}

    class FakeIMAP:
        def __init__(self, *args: Any, ssl_context: ssl.SSLContext | None = None, **kwargs: Any) -> None:
            seen["context"] = ssl_context

        def login(self, *args: Any) -> None:
            pass

        def select(self, *args: Any) -> None:
            pass

        def uid(self, *args: Any) -> tuple[str, list[bytes]]:
            return "OK", [b""]

    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(settings, "RESULT_MAIL_ADDRESS", "results@example.com")
    monkeypatch.setattr(settings, "RESULT_MAIL_PASSWORD", "secret")
    monkeypatch.setattr(settings, "RESULT_MAIL_IMAP_HOST", "imap.example.com")
    monkeypatch.setattr(imaplib, "IMAP4_SSL", FakeIMAP)

    _, messages = bounces._fetch_unseen()
    assert messages == []
    _assert_verifying(seen["context"])


def test_a_configured_ca_file_is_used(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, Any] = {}
    real = ssl.create_default_context

    def spy(*args: Any, **kwargs: Any) -> ssl.SSLContext:
        seen.update(kwargs)
        return real()

    monkeypatch.setattr(settings, "MAIL_TLS_CA_FILE", "/etc/examance/mail-ca.pem")
    monkeypatch.setattr(ssl, "create_default_context", spy)

    _assert_verifying(email_svc.mail_tls_context())
    assert seen["cafile"] == "/etc/examance/mail-ca.pem"
