"""Pydantic schemas for the MFA enrollment endpoints."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class TotpConfirmRequest(BaseModel):
    code: str = Field(min_length=6, max_length=10)


class MfaEnrollResponse(BaseModel):
    # Carries the shared secret. Returned once, at enrollment, and never again.
    otpauth_uri: str


class MfaBackupCodesResponse(BaseModel):
    # Plaintext, shown once. Only Argon2id hashes are stored.
    backup_codes: list[str]


class MfaStatusResponse(BaseModel):
    enrolled: list[str]
    # Of those, the ones that can also decrypt the account's data. TOTP cannot:
    # the secret lives server-side and a six-digit code carries no entropy to
    # derive a key from.
    key_capable: list[str]
    required_factor_count: int
    complete: bool
    remaining_backup_codes: int

    # Whether a usable recovery wrap exists, and when it was written. The code
    # itself is unrecoverable — this says only that one is on file, which is the
    # difference between "you have a way back" and "you have none".
    has_recovery_code: bool = False
    recovery_created_at: datetime | None = None

    # Per-factor activity. Null throughout means the event predates the columns,
    # not that it never happened; the UI says as much rather than showing a date
    # it does not have.
    password_changed_at: datetime | None = None
    password_last_used_at: datetime | None = None
    totp_created_at: datetime | None = None
    totp_last_used_at: datetime | None = None
