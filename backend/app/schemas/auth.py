"""Pydantic schemas for auth endpoints."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, EmailStr, Field

# Matches the policy already enforced by AdminCreateUserRequest and the
# `create-user` / `set-password` CLI commands.
PASSWORD_MIN_LENGTH = 12
PASSWORD_MAX_LENGTH = 256


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)


class LoginRequest(BaseModel):
    email: EmailStr
    # Bounded above only. A minimum here would let an attacker distinguish
    # "password too short" from "wrong password" and leak the policy applied
    # to an existing account; the upper bound keeps an oversized string from
    # reaching the 64 MiB-per-hash Argon2id verifier.
    password: str = Field(max_length=PASSWORD_MAX_LENGTH)


class AuthResponse(BaseModel):
    # The account id is returned so the client can bind its key-envelope AAD to
    # the account rather than to the email address, which is the only other
    # identifier it holds. Not a secret: the caller has just authenticated as
    # this account.
    id: uuid.UUID
    email: str
    role: str


class TokenClaims(BaseModel):
    sub: str          # teacher_id (UUID string)
    email: str
    role: str
    exp: int          # Unix timestamp
    jti: str | None = None  # JWT ID — used for refresh token revocation
