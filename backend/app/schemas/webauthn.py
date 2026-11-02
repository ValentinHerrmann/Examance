"""Pydantic schemas for the passkey endpoints."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CeremonyOptionsResponse(BaseModel):
    # Opaque handle tying the returned options to the challenge held server-side.
    handle: str
    challenge_b64: str
    # The WebAuthn options, already JSON-encoded by py_webauthn.
    options_json: str


class RegistrationVerifyRequest(BaseModel):
    handle: str
    challenge_b64: str
    credential_json: str
    # Read from getClientExtensionResults().prf?.enabled in the browser. False means the passkey authenticates but cannot unwrap the data key.
    supports_prf: bool = False
    nickname: str | None = Field(default=None, max_length=64)


class AuthenticationOptionsRequest(BaseModel):
    # Ask for a passkey of the previous domain from the new one (issue #198); the browser checks the old domain's `/.well-known/webauthn` before it allows that.
    legacy: bool = False


class AuthenticationVerifyRequest(BaseModel):
    handle: str
    challenge_b64: str
    credential_json: str


class CredentialSummary(BaseModel):
    credential_id_b64: str
    nickname: str | None
    supports_prf: bool
    # The PRF *input*, not its output. Public and fixed per credential, so the same authenticator always derives the same key-encryption key. The derived secret never leaves the browser.
    prf_salt_b64: str
    created_at: datetime
    last_used_at: datetime | None
    # Made for an old domain that is being retired (issue #198): it stops working there, so the UI asks for a new passkey.
    legacy: bool = False


class CredentialListResponse(BaseModel):
    credentials: list[CredentialSummary]
