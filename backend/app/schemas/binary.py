"""Strict base64 decoding helpers for client-supplied ciphertext fields."""
from __future__ import annotations

import base64

from fastapi import HTTPException, status

# AES-256-GCM parameters used by the frontend (see lib/crypto/aesGcm.ts).
GCM_IV_BYTES = 12
ARGON2_SALT_BYTES = 16


def decode_b64(value: str, field: str, *, expected_len: int | None = None) -> bytes:
    """Decode *value* as strict base64, or raise 400. ``validate=True`` matters: the default silently drops non-alphabet characters, so corrupted ciphertext would be stored and fail much later as a GCM authentication error."""
    try:
        decoded = base64.b64decode(value, validate=True)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Field '{field}' is not valid base64.",
        ) from None

    if expected_len is not None and len(decoded) != expected_len:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Field '{field}' must decode to exactly {expected_len} bytes.",
        )
    return decoded


def decode_credential_id(value: str, field: str) -> bytes:
    """Decode a WebAuthn credential ID sent as standard or URL-safe base64, padded or not (the passkey list and `rawId` use base64url); other characters still fail strictly."""
    normalized = value.replace("-", "+").replace("_", "/")
    return decode_b64(normalized + "=" * (-len(normalized) % 4), field)
