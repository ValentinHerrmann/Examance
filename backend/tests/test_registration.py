"""Self-registration, admin approval and per-account features (issue #53).

Covers the public flow (verification mail, single-use token, auto-approval for allowed domains),
what a pending account can and cannot do, the admin side (approve, reject, invite, feature
switches, allowed domains), where the switches are enforced, and retention of stale
registrations.

Mail is captured by patching ``app.services.email.send_email``. The raw verification token only
exists inside the mailed link, so the tests read it back from the captured message. Background
tasks run inside the request under httpx's ASGITransport, so a captured mail is there as soon as
the ``await client.post(...)`` returns.

The database is shared across the whole session: every address and domain is unique per test.
"""
from __future__ import annotations

import base64
import hashlib
import re
import secrets
import uuid
from collections.abc import AsyncGenerator, Iterator
from contextlib import contextmanager
from datetime import UTC, date, datetime, timedelta
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from app.main import app
from app.models.allowed_email_domain import AllowedEmailDomain
from app.models.audit_log import AuditLog
from app.models.exam import Exam
from app.models.registration_request import RegistrationRequest
from app.models.teacher import Teacher
from app.services import retention
from app.services.crypto import hash_password
from app.services.password_reset import create_reset_token

from .factors import DEFAULT_PASSWORD, create_teacher, sign_in

pytestmark = pytest.mark.asyncio

REGISTER = "/api/v1/auth/register"
COMPLETE = "/api/v1/auth/register/complete"
LOGIN = "/api/v1/auth/login"
FORGOT = "/api/v1/auth/forgot-password"
RESET_START = "/api/v1/auth/reset/start"
CAPABILITIES = "/api/v1/user/capabilities"
ADMIN_USERS = "/api/v1/admin/users"
ADMIN_DOMAINS = "/api/v1/admin/allowed-domains"

WRONG_PASSWORD = "not-the-password-1"  # noqa: S105 - test fixture credential
ALL_FEATURES = {"server_results": True, "server_latex": True}


# --------------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------------


def _email(prefix: str = "reg") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}@school.example"


def _unique_domain() -> str:
    return f"{uuid.uuid4().hex[:10]}.example"


@contextmanager
def _outbox() -> Iterator[AsyncMock]:
    """Capture outgoing mail instead of sending it (delivery reports success)."""
    with patch("app.services.email.send_email", return_value=True) as sent:
        yield sent


def _mails_to(sent: AsyncMock, address: str) -> list[dict[str, Any]]:
    return [call.kwargs for call in sent.call_args_list if call.kwargs["to_email"] == address]


def _token_in(mail: dict[str, Any], page: str) -> str:
    """The raw token from the ``/<page>?token=...`` link of a captured mail."""
    found = re.search(rf"/{page}\?token=([\w-]+)", mail["body_text"])
    assert found is not None, mail["body_text"]
    return found.group(1)


async def _find_teacher(db: AsyncSession, email: str) -> Teacher | None:
    # populate_existing: the API wrote through other sessions, this one may hold a stale copy.
    return await db.scalar(
        select(Teacher).where(Teacher.email == email).execution_options(populate_existing=True)
    )


async def _teacher(db: AsyncSession, email: str) -> Teacher:
    teacher = await _find_teacher(db, email)
    assert teacher is not None, f"no account for {email}"
    return teacher


async def _find_request(db: AsyncSession, email: str) -> RegistrationRequest | None:
    return await db.scalar(
        select(RegistrationRequest)
        .where(RegistrationRequest.email == email)
        .execution_options(populate_existing=True)
    )


async def _request_link(client: AsyncClient, email: str) -> str:
    """POST /auth/register and return the raw token from the one mail that went out."""
    with _outbox() as sent:
        resp = await client.post(REGISTER, json={"email": email})
    assert resp.status_code == 202, resp.text
    (mail,) = _mails_to(sent, email)
    return _token_in(mail, "verify-email")


async def _complete(client: AsyncClient, token: str, *, note: str | None = None) -> Response:
    with _outbox():
        return await client.post(
            COMPLETE,
            json={"token": token, "new_password": DEFAULT_PASSWORD, "note": note},
        )


async def _register(
    client: AsyncClient, email: str, *, note: str | None = None
) -> dict[str, str]:
    """The whole public flow for *email*; returns the body of the completion response."""
    resp = await _complete(client, await _request_link(client, email), note=note)
    assert resp.status_code == 200, resp.text
    return dict(resp.json())


def _assert_invalid_token(resp: Response) -> None:
    assert resp.status_code == 400
    assert resp.headers.get("code") == "ERR_INVALID_REGISTRATION_TOKEN"


def _student_payload() -> dict[str, str]:
    return {
        "pseudonym_hmac": secrets.token_hex(32),
        "pii_ciphertext_b64": base64.b64encode(b"fake-encrypted-pii").decode(),
        "iv_b64": base64.b64encode(secrets.token_bytes(12)).decode(),
        "encryption_salt_b64": base64.b64encode(secrets.token_bytes(16)).decode(),
    }


async def _create_exam(client: AsyncClient) -> str:
    resp = await client.post(
        "/api/v1/exams",
        json={
            "title": "Feature gate",
            "retention_until": (date.today() + timedelta(days=365)).isoformat(),
        },
    )
    assert resp.status_code == 201, resp.text
    return str(resp.json()["id"])


# --------------------------------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def registration_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    """Registration is off by default; tests that want it off say so themselves."""
    monkeypatch.setattr(settings, "REGISTRATION_ENABLED", True)


@pytest_asyncio.fixture
async def visitor(client: AsyncClient) -> AsyncGenerator[AsyncClient, None]:
    """A second, anonymous client (the registrant) next to the signed-in `client`."""
    # Depends on `client` only so that the database override is in place.
    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://test") as other:
        yield other


@pytest_asyncio.fixture
async def admin(client: AsyncClient, db: AsyncSession) -> Teacher:
    """`client`, signed in as a fresh admin."""
    return await sign_in(client, db, _email("admin"), role="admin")


@pytest_asyncio.fixture
async def retention_db(
    engine: Any, monkeypatch: pytest.MonkeyPatch
) -> AsyncGenerator[AsyncSession, None]:
    """Point the retention service at the test engine and yield a session."""
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(retention, "AsyncSessionLocal", session_factory)
    async with session_factory() as session:
        yield session


# --------------------------------------------------------------------------------------------
# Public registration flow
# --------------------------------------------------------------------------------------------


async def test_registration_status_reports_the_setting(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    for enabled in (False, True):
        monkeypatch.setattr(settings, "REGISTRATION_ENABLED", enabled)
        resp = await client.get(REGISTER)
        assert resp.status_code == 200
        assert resp.json() == {"enabled": enabled}


async def test_registration_is_refused_when_disabled(
    client: AsyncClient, db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "REGISTRATION_ENABLED", False)
    email = _email()

    with _outbox() as sent:
        start = await client.post(REGISTER, json={"email": email})
        finish = await client.post(
            COMPLETE, json={"token": "irrelevant", "new_password": DEFAULT_PASSWORD}
        )

    for resp in (start, finish):
        assert resp.status_code == 403
        assert resp.headers.get("code") == "ERR_REGISTRATION_DISABLED"
    sent.assert_not_called()
    assert await _find_request(db, email) is None


async def test_register_mails_a_verification_link(client: AsyncClient, db: AsyncSession) -> None:
    email = _email()

    with _outbox() as sent:
        resp = await client.post(REGISTER, json={"email": email})

    assert resp.status_code == 202
    (mail,) = _mails_to(sent, email)
    token = _token_in(mail, "verify-email")
    assert f"{settings.FRONTEND_URL.rstrip('/')}/verify-email?token={token}" in mail["body_text"]

    # Nothing is created until the link is used, and the token is only stored as a hash.
    assert await _find_teacher(db, email) is None
    row = await _find_request(db, email)
    assert row is not None
    assert row.token_hash == hashlib.sha256(token.encode()).hexdigest()


async def test_register_gives_nothing_away_for_a_known_address(
    client: AsyncClient, db: AsyncSession
) -> None:
    known = _email("known")
    await create_teacher(db, known)

    with _outbox() as sent:
        fresh_resp = await client.post(REGISTER, json={"email": _email()})
        assert sent.call_count == 1  # the new address got its mail
        known_resp = await client.post(REGISTER, json={"email": known})
        shouted_resp = await client.post(REGISTER, json={"email": known.upper()})

    assert sent.call_count == 1  # the known address (in either spelling) got none
    assert known_resp.status_code == shouted_resp.status_code == fresh_resp.status_code == 202
    assert known_resp.json() == shouted_resp.json() == fresh_resp.json()
    assert await _find_request(db, known) is None


async def test_resend_cooldown_sends_one_mail(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "REGISTRATION_RESEND_COOLDOWN_SECONDS", 300)
    email = _email()

    with _outbox() as sent:
        first = await client.post(REGISTER, json={"email": email})
        second = await client.post(REGISTER, json={"email": email})

    assert first.status_code == second.status_code == 202
    assert first.json() == second.json()
    assert len(_mails_to(sent, email)) == 1


async def test_a_resent_link_replaces_the_previous_one(
    client: AsyncClient, db: AsyncSession
) -> None:
    email = _email()
    first_token = await _request_link(client, email)

    # Let the cooldown elapse.
    row = await _find_request(db, email)
    assert row is not None
    row.last_sent_at = datetime.now(UTC) - timedelta(
        seconds=settings.REGISTRATION_RESEND_COOLDOWN_SECONDS + 1
    )
    await db.commit()

    second_token = await _request_link(client, email)
    assert second_token != first_token
    _assert_invalid_token(await _complete(client, first_token))
    assert (await _complete(client, second_token)).status_code == 200


async def test_complete_without_domain_rule_leaves_the_account_pending(
    client: AsyncClient, db: AsyncSession
) -> None:
    email = _email()
    token = await _request_link(client, email)

    resp = await _complete(client, token, note="  Teaches physics at the Gymnasium  ")

    assert resp.status_code == 200
    assert resp.json() == {"status": "pending"}
    assert not resp.cookies.get("access_token")  # no session either way
    teacher = await _teacher(db, email)
    assert teacher.approved_at is None
    assert teacher.role == "teacher"
    assert teacher.password_hash is not None
    assert teacher.registration_note == "Teaches physics at the Gymnasium"
    assert await _find_request(db, email) is None  # the token was consumed


async def test_a_registration_token_works_once(client: AsyncClient, db: AsyncSession) -> None:
    email = _email()
    token = await _request_link(client, email)
    assert (await _complete(client, token, note="first")).status_code == 200

    _assert_invalid_token(await _complete(client, token, note="second"))
    assert (await _teacher(db, email)).registration_note == "first"


async def test_an_unknown_registration_token_is_refused(client: AsyncClient) -> None:
    _assert_invalid_token(await _complete(client, secrets.token_urlsafe(32)))


async def test_an_expired_registration_token_is_refused(
    client: AsyncClient, db: AsyncSession
) -> None:
    email = _email()
    token = await _request_link(client, email)
    row = await _find_request(db, email)
    assert row is not None
    row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    await db.commit()

    _assert_invalid_token(await _complete(client, token))
    assert await _find_teacher(db, email) is None


async def test_allowed_domain_approves_on_the_spot(
    client: AsyncClient, db: AsyncSession
) -> None:
    domain = _unique_domain()
    db.add(AllowedEmailDomain(domain=domain, allow_server_results=False, allow_server_latex=True))
    await db.commit()
    email = f"reg-{uuid.uuid4().hex[:8]}@{domain}"

    body = await _register(client, email, note="This note is not kept")

    assert body == {"status": "approved"}
    teacher = await _teacher(db, email)
    assert teacher.approved_at is not None
    assert teacher.allow_server_results is False  # the domain's features are copied
    assert teacher.allow_server_latex is True
    assert teacher.registration_note is None

    # Approved means the normal sign-in applies: one factor so far, so enrollment is next.
    login = await client.post(LOGIN, json={"email": email, "password": DEFAULT_PASSWORD})
    assert login.status_code == 200
    assert login.json()["status"] == "enroll_required"


async def test_domain_match_is_exact(client: AsyncClient, db: AsyncSession) -> None:
    domain = _unique_domain()
    db.add(AllowedEmailDomain(domain=domain))
    await db.commit()

    # A subdomain and a look-alike that merely ends in the same text both need an admin.
    for address in (
        f"reg-{uuid.uuid4().hex[:8]}@sub.{domain}",
        f"reg-{uuid.uuid4().hex[:8]}@evil{domain}",
    ):
        assert await _register(client, address) == {"status": "pending"}
        assert (await _teacher(db, address)).approved_at is None


# --------------------------------------------------------------------------------------------
# A pending account holds no token of any kind
# --------------------------------------------------------------------------------------------


async def test_pending_account_gets_approval_pending_not_a_session(
    client: AsyncClient, db: AsyncSession
) -> None:
    email = _email()
    await _register(client, email)

    login = await client.post(LOGIN, json={"email": email, "password": DEFAULT_PASSWORD})

    assert login.status_code == 200
    body = login.json()
    assert body["status"] == "approval_pending"
    assert body["satisfied"] == ["password"]
    assert body["available"] == []
    assert not login.cookies.get("access_token")
    assert not client.cookies.get("access_token")
    assert (await client.get(CAPABILITIES)).status_code == 401


async def test_pending_account_wrong_password_is_a_plain_credential_error(
    client: AsyncClient, db: AsyncSession
) -> None:
    email = _email()
    await _register(client, email)

    wrong = await client.post(LOGIN, json={"email": email, "password": WRONG_PASSWORD})
    unknown = await client.post(
        LOGIN, json={"email": _email("nobody"), "password": WRONG_PASSWORD}
    )

    for resp in (wrong, unknown):
        assert resp.status_code == 401
        assert resp.headers.get("code") == "ERR_INVALID_CREDENTIALS"
    assert wrong.json() == unknown.json()


async def test_forgot_password_sends_nothing_to_a_pending_account(
    client: AsyncClient, db: AsyncSession
) -> None:
    pending = _email("pending")
    await _register(client, pending)

    with _outbox() as sent:
        pending_resp = await client.post(FORGOT, json={"email": pending})
        unknown_resp = await client.post(FORGOT, json={"email": _email("nobody")})

    assert pending_resp.status_code == unknown_resp.status_code == 200
    assert pending_resp.json() == unknown_resp.json()
    sent.assert_not_called()


async def test_a_pending_account_cannot_open_a_reset(
    client: AsyncClient, db: AsyncSession
) -> None:
    email = _email()
    await _register(client, email)
    raw_token, _mail = await create_reset_token(db, await _teacher(db, email))
    await db.commit()

    resp = await client.post(RESET_START, json={"token": raw_token})

    assert resp.status_code == 400
    assert resp.headers.get("code") == "ERR_INVALID_TOKEN"


async def test_a_session_dies_when_the_account_loses_its_approval(
    client: AsyncClient, db: AsyncSession
) -> None:
    teacher = await sign_in(client, db, _email("revoked"))
    assert (await client.get(CAPABILITIES)).status_code == 200

    teacher.approved_at = None
    await db.commit()

    assert (await client.get(CAPABILITIES)).status_code == 401
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401


# --------------------------------------------------------------------------------------------
# Admin: approve, reject, invite
# --------------------------------------------------------------------------------------------


async def test_admin_lists_pending_registrations_with_their_note(
    client: AsyncClient, visitor: AsyncClient, db: AsyncSession, admin: Teacher
) -> None:
    email = _email()
    await _register(visitor, email, note="Physics, grades 10 to 12")

    pending = await client.get(ADMIN_USERS, params={"status": "pending", "limit": 200})

    assert pending.status_code == 200
    items = pending.json()["items"]
    assert all(item["approved_at"] is None for item in items)
    (entry,) = [item for item in items if item["email"] == email]
    assert entry["registration_note"] == "Physics, grades 10 to 12"
    assert entry["password_set"] is True

    # A pending account is not an active one.
    active = await client.get(ADMIN_USERS, params={"status": "active", "limit": 200})
    assert email not in {item["email"] for item in active.json()["items"]}


async def test_approval_applies_features_and_clears_the_note(
    client: AsyncClient, visitor: AsyncClient, db: AsyncSession, admin: Teacher
) -> None:
    email = _email()
    await _register(visitor, email, note="Physics, grades 10 to 12")
    url = f"{ADMIN_USERS}/{(await _teacher(db, email)).id}/approve"
    features = {"server_results": False, "server_latex": True}

    with _outbox() as sent:
        resp = await client.post(url, json={"features": features})

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["approved_at"] is not None
    assert body["registration_note"] is None
    assert body["features"] == features
    teacher = await _teacher(db, email)
    assert teacher.approved_at is not None
    assert teacher.registration_note is None
    assert (teacher.allow_server_results, teacher.allow_server_latex) == (False, True)
    (mail,) = _mails_to(sent, email)
    assert "approved" in mail["subject"]
    assert "Physics" not in mail["body_text"]  # what a registrant typed is never mailed

    # A second approval conflicts and changes nothing.
    again = await client.post(url, json={"features": ALL_FEATURES})
    assert again.status_code == 409
    assert again.headers.get("code") == "ERR_ALREADY_APPROVED"
    assert (await _teacher(db, email)).allow_server_results is False


async def test_approval_lifts_the_sign_in_gate(
    client: AsyncClient, visitor: AsyncClient, db: AsyncSession, admin: Teacher
) -> None:
    email = _email()
    await _register(visitor, email)
    credentials = {"email": email, "password": DEFAULT_PASSWORD}

    before = await visitor.post(LOGIN, json=credentials)
    assert before.json()["status"] == "approval_pending"

    approved = await client.post(
        f"{ADMIN_USERS}/{(await _teacher(db, email)).id}/approve",
        json={"features": ALL_FEATURES},
    )
    assert approved.status_code == 200, approved.text

    # One factor (the password) is enrolled, so the next step is enrollment.
    after = await visitor.post(LOGIN, json=credentials)
    assert after.status_code == 200
    assert after.json()["status"] == "enroll_required"


async def test_approval_endpoints_need_an_admin(
    client: AsyncClient, visitor: AsyncClient, db: AsyncSession
) -> None:
    pending = _email()
    await _register(visitor, pending)
    target = (await _teacher(db, pending)).id
    calls: list[tuple[str, str, dict[str, Any] | None]] = [
        ("GET", ADMIN_USERS, None),
        ("POST", ADMIN_USERS, {"email": _email("invited")}),
        ("POST", f"{ADMIN_USERS}/{target}/approve", {"features": ALL_FEATURES}),
        ("POST", f"{ADMIN_USERS}/{target}/reject", None),
        ("PATCH", f"{ADMIN_USERS}/{target}/features", {"server_results": False}),
        ("GET", ADMIN_DOMAINS, None),
        ("POST", ADMIN_DOMAINS, {"domain": _unique_domain()}),
        ("PATCH", f"{ADMIN_DOMAINS}/{target}", {"server_latex": False}),
        ("DELETE", f"{ADMIN_DOMAINS}/{target}", None),
    ]

    for method, path, body in calls:
        anonymous = await visitor.request(method, path, json=body)
        assert anonymous.status_code == 401, (method, path)

    await sign_in(client, db, _email("teacher"))
    for method, path, body in calls:
        teacher = await client.request(method, path, json=body)
        assert teacher.status_code == 403, (method, path, teacher.text)

    assert (await _teacher(db, pending)).approved_at is None


async def test_reject_deletes_a_pending_account_and_tells_the_registrant(
    client: AsyncClient, visitor: AsyncClient, db: AsyncSession, admin: Teacher
) -> None:
    email = _email()
    await _register(visitor, email)
    pending = await _teacher(db, email)

    with _outbox() as sent:
        resp = await client.post(f"{ADMIN_USERS}/{pending.id}/reject")

    assert resp.status_code == 204
    assert await _find_teacher(db, email) is None
    (mail,) = _mails_to(sent, email)
    assert "not approved" in mail["body_text"]


async def test_an_approved_account_cannot_be_rejected(
    client: AsyncClient, db: AsyncSession, admin: Teacher
) -> None:
    email = _email()
    approved = await create_teacher(db, email)

    with _outbox() as sent:
        resp = await client.post(f"{ADMIN_USERS}/{approved.id}/reject")

    assert resp.status_code == 409
    assert resp.headers.get("code") == "ERR_ALREADY_APPROVED"
    assert await _find_teacher(db, email) is not None
    sent.assert_not_called()


async def test_admin_password_reset_refuses_a_pending_account(
    client: AsyncClient, visitor: AsyncClient, db: AsyncSession, admin: Teacher
) -> None:
    email = _email()
    await _register(visitor, email)
    pending = await _teacher(db, email)

    with _outbox() as sent:
        resp = await client.post(f"{ADMIN_USERS}/{pending.id}/reset-password")

    assert resp.status_code == 409
    assert resp.headers.get("code") == "ERR_ACCOUNT_PENDING"
    sent.assert_not_called()


async def test_invite_creates_an_approved_account_and_supersedes_a_pending_link(
    client: AsyncClient, visitor: AsyncClient, db: AsyncSession, admin: Teacher
) -> None:
    email = _email()
    stale_token = await _request_link(visitor, email)  # an unverified self-registration
    features = {"server_results": False, "server_latex": False}

    with _outbox() as sent:
        resp = await client.post(
            ADMIN_USERS, json={"email": email, "role": "teacher", "features": features}
        )

    assert resp.status_code == 201, resp.text
    assert resp.json()["password_reset_sent"] is True
    teacher = await _teacher(db, email)
    assert teacher.approved_at is not None
    assert teacher.password_hash is None
    assert (teacher.allow_server_results, teacher.allow_server_latex) == (False, False)
    assert await _find_request(db, email) is None
    _assert_invalid_token(await _complete(visitor, stale_token))

    # The invitation link opens a reset; the account has no data, so no key recovery step.
    (mail,) = _mails_to(sent, email)
    assert "invited" in mail["subject"]
    start = await visitor.post(RESET_START, json={"token": _token_in(mail, "reset-password")})
    assert start.status_code == 200, start.text
    assert start.json()["needs_key_recovery"] is False


async def test_invite_refuses_pending_and_existing_addresses(
    client: AsyncClient, visitor: AsyncClient, db: AsyncSession, admin: Teacher
) -> None:
    pending = _email("pending")
    await _register(visitor, pending)
    existing = _email("existing")
    await create_teacher(db, existing)

    with _outbox() as sent:
        on_pending = await client.post(ADMIN_USERS, json={"email": pending})
        on_existing = await client.post(ADMIN_USERS, json={"email": existing})

    assert on_pending.status_code == 409
    assert on_pending.headers.get("code") == "ERR_ACCOUNT_PENDING"
    assert on_existing.status_code == 409
    assert on_existing.headers.get("code") == "ERR_ACCOUNT_EXISTS"
    sent.assert_not_called()
    assert (await _teacher(db, pending)).approved_at is None


# --------------------------------------------------------------------------------------------
# Admin: feature switches and allowed domains
# --------------------------------------------------------------------------------------------


async def test_feature_switches_drive_the_account_capabilities(
    client: AsyncClient, visitor: AsyncClient, db: AsyncSession, admin: Teacher
) -> None:
    teacher = await sign_in(visitor, db, _email("teacher"))
    url = f"{ADMIN_USERS}/{teacher.id}/features"

    async def capabilities() -> dict[str, Any]:
        resp = await visitor.get(CAPABILITIES)
        assert resp.status_code == 200, resp.text
        return dict(resp.json())

    start = await capabilities()
    assert set(start["allowed_storage_modes"]) == {"all-server", "hybrid"}
    assert start["features"]["server_results"] is True
    assert start["features"]["server_latex"] is True

    # A partial change: the omitted switch stays as it was.
    patched = await client.patch(url, json={"server_results": False})
    assert patched.status_code == 200, patched.text
    assert patched.json()["features"] == {"server_results": False, "server_latex": True}
    caps = await capabilities()
    assert caps["allowed_storage_modes"] == ["hybrid"]
    assert caps["features"]["server_results"] is False
    assert caps["features"]["server_latex"] is True

    assert (await client.patch(url, json={"server_latex": False})).status_code == 200
    caps = await capabilities()
    assert caps["allowed_storage_modes"] == ["hybrid"]
    assert caps["features"]["server_latex"] is False

    assert (await client.patch(url, json=ALL_FEATURES)).status_code == 200
    caps = await capabilities()
    assert set(caps["allowed_storage_modes"]) == {"all-server", "hybrid"}
    assert caps["features"]["server_latex"] is True


async def test_allowed_domain_is_normalised_and_unique(
    client: AsyncClient, admin: Teacher
) -> None:
    label = uuid.uuid4().hex[:10]

    created = await client.post(ADMIN_DOMAINS, json={"domain": f"@{label}.Example"})

    assert created.status_code == 201, created.text
    assert created.json()["domain"] == f"{label}.example"
    assert created.json()["features"] == ALL_FEATURES

    duplicate = await client.post(ADMIN_DOMAINS, json={"domain": f"{label}.example"})
    assert duplicate.status_code == 409
    assert duplicate.headers.get("code") == "ERR_DOMAIN_EXISTS"


@pytest.mark.parametrize("bad", ["not a domain", "*.x.de", "de"])
async def test_invalid_domains_are_refused(
    client: AsyncClient, admin: Teacher, bad: str
) -> None:
    resp = await client.post(ADMIN_DOMAINS, json={"domain": bad})

    assert resp.status_code == 400
    assert resp.headers.get("code") == "ERR_INVALID_DOMAIN"


async def test_allowed_domain_can_be_listed_updated_and_removed(
    client: AsyncClient, admin: Teacher
) -> None:
    domain = _unique_domain()
    created = await client.post(
        ADMIN_DOMAINS,
        json={"domain": domain, "features": {"server_results": True, "server_latex": False}},
    )
    assert created.status_code == 201, created.text
    entry = created.json()
    assert entry["features"] == {"server_results": True, "server_latex": False}

    async def listed() -> set[str]:
        resp = await client.get(ADMIN_DOMAINS)
        assert resp.status_code == 200
        return {row["domain"] for row in resp.json()}

    assert domain in await listed()

    patched = await client.patch(f"{ADMIN_DOMAINS}/{entry['id']}", json={"server_results": False})
    assert patched.status_code == 200, patched.text
    assert patched.json()["features"] == {"server_results": False, "server_latex": False}

    removed = await client.delete(f"{ADMIN_DOMAINS}/{entry['id']}")
    assert removed.status_code == 204
    assert domain not in await listed()
    assert (await client.delete(f"{ADMIN_DOMAINS}/{entry['id']}")).status_code == 404


# --------------------------------------------------------------------------------------------
# Feature enforcement
# --------------------------------------------------------------------------------------------


async def test_latex_compilation_needs_the_server_latex_feature(
    client: AsyncClient, db: AsyncSession
) -> None:
    teacher = await sign_in(client, db, _email("latex"))
    exam_id = await _create_exam(client)
    body = {"latex": "\\documentclass{article}"}

    teacher.allow_server_latex = False
    await db.commit()
    with patch("app.routers.compile.compile_latex", return_value=b"%PDF-1.4 fake") as compiler:
        for path in ("/api/v1/compile/latex", f"/api/v1/exams/{exam_id}/compile"):
            refused = await client.post(path, json=body)
            assert refused.status_code == 403, path
            assert refused.headers.get("code") == "ERR_FEATURE_NOT_ALLOWED"
        compiler.assert_not_called()

        teacher.allow_server_latex = True
        await db.commit()
        allowed = await client.post("/api/v1/compile/latex", json=body)
        assert allowed.status_code == 200, allowed.text


async def _exam_of_a_teacher_without_server_results(
    client: AsyncClient, db: AsyncSession, storage_mode: str
) -> str:
    """Sign in, create an exam, then revoke `server_results`; returns the students URL."""
    teacher = await sign_in(client, db, _email("results"))
    exam_id = await _create_exam(client)  # exams always live on the server, never gated
    teacher.allow_server_results = False
    teacher.storage_mode = storage_mode
    await db.commit()
    return f"/api/v1/exams/{exam_id}/students"


async def test_hybrid_account_without_server_results_cannot_write_results(
    client: AsyncClient, db: AsyncSession
) -> None:
    students = await _exam_of_a_teacher_without_server_results(client, db, "hybrid")

    refused = await client.post(students, json=_student_payload())

    assert refused.status_code == 403
    assert refused.headers.get("code") == "ERR_FEATURE_NOT_ALLOWED"
    assert (await client.get(students)).status_code == 200  # reads are never gated


async def test_revoked_all_server_account_keeps_writing_until_it_moves(
    client: AsyncClient, db: AsyncSession
) -> None:
    # Refusing these writes would strand them in the browser's offline queue.
    students = await _exam_of_a_teacher_without_server_results(client, db, "all-server")

    resp = await client.post(students, json=_student_payload())

    assert resp.status_code == 201, resp.text


# --------------------------------------------------------------------------------------------
# Retention
# --------------------------------------------------------------------------------------------


def _aged() -> datetime:
    return datetime.now(UTC) - timedelta(days=settings.PENDING_ACCOUNT_RETENTION_DAYS + 1)


async def _add_pending_teacher(session: AsyncSession, *, created_at: datetime) -> Teacher:
    teacher = Teacher(
        email=_email("stale"),
        password_hash=hash_password(DEFAULT_PASSWORD),
        role="teacher",
        approved_at=None,
        created_at=created_at,
    )
    session.add(teacher)
    await session.commit()
    return teacher


async def _exists(session: AsyncSession, model: Any, row_id: uuid.UUID) -> bool:
    return await session.scalar(select(model.id).where(model.id == row_id)) is not None


async def test_retention_removes_a_stale_pending_account_without_data(
    retention_db: AsyncSession,
) -> None:
    stale = await _add_pending_teacher(retention_db, created_at=_aged())
    recent = await _add_pending_teacher(retention_db, created_at=datetime.now(UTC))
    old_but_approved = Teacher(
        email=_email("old"),
        password_hash=hash_password(DEFAULT_PASSWORD),
        role="teacher",
        approved_at=datetime.now(UTC),
        created_at=_aged(),
    )
    retention_db.add(old_but_approved)
    await retention_db.commit()

    await retention.run()

    assert not await _exists(retention_db, Teacher, stale.id)
    assert await _exists(retention_db, Teacher, recent.id)
    assert await _exists(retention_db, Teacher, old_but_approved.id)
    # The audit entry names the account by the hash of its id, never by its address.
    entry = await retention_db.scalar(
        select(AuditLog).where(
            AuditLog.action == "USER_REJECTED",
            AuditLog.target_hash == hashlib.sha256(str(stale.id).encode()).hexdigest(),
        )
    )
    assert entry is not None
    assert entry.teacher_email == "system:retention-cron"


async def test_retention_keeps_a_stale_pending_account_that_owns_data(
    retention_db: AsyncSession,
) -> None:
    owner = await _add_pending_teacher(retention_db, created_at=_aged())
    retention_db.add(
        Exam(
            teacher_id=owner.id,
            title="Held data",
            latex_template="",
            retention_until=date.today() + timedelta(days=365),
        )
    )
    await retention_db.commit()

    await retention.run()

    assert await _exists(retention_db, Teacher, owner.id)


async def test_retention_removes_expired_registration_requests(
    retention_db: AsyncSession,
) -> None:
    now = datetime.now(UTC)

    def request(expires_at: datetime) -> RegistrationRequest:
        email = _email("unverified")
        return RegistrationRequest(
            email=email,
            token_hash=hashlib.sha256(email.encode()).hexdigest(),
            expires_at=expires_at,
            last_sent_at=expires_at - timedelta(hours=settings.REGISTRATION_TOKEN_TTL_HOURS),
        )

    expired = request(now - timedelta(hours=1))
    live = request(now + timedelta(hours=1))
    retention_db.add_all([expired, live])
    await retention_db.commit()

    await retention.run()

    assert not await _exists(retention_db, RegistrationRequest, expired.id)
    assert await _exists(retention_db, RegistrationRequest, live.id)
