"""Pydantic schemas for the MFA enrollment endpoints."""
from __future__ import annotations

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
