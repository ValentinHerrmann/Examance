"""Pydantic schemas for auth endpoints."""
from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.schemas.key_envelope import KeyEnvelopeSetIn

# Matches the policy already enforced by AdminCreateUserRequest and the
# `create-user` / `set-password` CLI commands.
PASSWORD_MIN_LENGTH = 12
PASSWORD_MAX_LENGTH = 256


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetTokenRequest(BaseModel):
    token: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)
    # The data key, re-wrapped in the browser under the new password. Written in
    # the same transaction as the password so the two cannot end up disagreeing.
    # Absent when the teacher could not recover their key — the account is reset,
    # the old data stays sealed, and they are told so plainly.
    envelope: KeyEnvelopeSetIn | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    # Bounded above only. A minimum here would let an attacker distinguish
    # "password too short" from "wrong password" and leak the policy applied
    # to an existing account; the upper bound keeps an oversized string from
    # reaching the 64 MiB-per-hash Argon2id verifier.
    password: str = Field(max_length=PASSWORD_MAX_LENGTH)


class TotpFactorRequest(BaseModel):
    code: str = Field(min_length=6, max_length=10)


class BackupCodeRequest(BaseModel):
    code: str = Field(min_length=4, max_length=64)


class AuthResponse(BaseModel):
    # The account id is returned so the client can bind its key-envelope AAD to
    # the account rather than to the email address, which is the only other
    # identifier it holds. Not a secret: the caller has just authenticated as
    # this account.
    id: uuid.UUID
    email: str
    role: str

    # How far the sign-in got.
    #   ok              — two distinct factors presented; a real session exists.
    #   factor_required — one down, `available` says what may come next.
    #   enroll_required — fewer than two factors enrolled; only the enrollment
    #                     endpoints are reachable until that is fixed.
    status: Literal["ok", "factor_required", "enroll_required"] = "ok"
    satisfied: list[str] = Field(default_factory=list)
    # Only ever populated after a factor has been proven. Answering it earlier
    # would turn the endpoint into an account-profile oracle.
    available: list[str] = Field(default_factory=list)


class TokenClaims(BaseModel):
    sub: str          # teacher_id (UUID string)
    email: str
    role: str
    exp: int          # Unix timestamp
    jti: str | None = None  # JWT ID — used for refresh token revocation
