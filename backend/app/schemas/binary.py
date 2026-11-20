"""The base64 helpers: strict decoding of client-supplied fields and encoding of stored bytes (issue #299: one copy each)."""
from __future__ import annotations

import base64

from fastapi import HTTPException, status

# AES-256-GCM parameters used by the frontend (see lib/crypto/aesGcm.ts).
GCM_IV_BYTES = 12
ARGON2_SALT_BYTES = 16


def encode_b64(value: bytes) -> str:
    """Standard base64 of stored bytes, for a response field that is always set."""
    return base64.b64encode(value).decode("ascii")


def encode_b64_or_none(value: bytes | None) -> str | None:
    """Like `encode_b64` for an optional field: None when there are no bytes (an empty ciphertext never exists, so empty and missing mean the same)."""
    return encode_b64(value) if value else None


def strict_b64decode(value: str) -> bytes:
    """Decode strict base64 or raise ValueError. ``validate=True`` matters: the default silently drops non-alphabet characters, so corrupted ciphertext would be stored and fail much later as a GCM authentication error."""
    return base64.b64decode(value, validate=True)


def decode_b64(value: str, field: str, *, expected_len: int | None = None) -> bytes:
    """Decode *value* as strict base64 (`strict_b64decode`), or raise 400."""
    try:
        decoded = strict_b64decode(value)
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
