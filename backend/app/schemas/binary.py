"""Strict base64 decoding helpers for client-supplied ciphertext fields."""
from __future__ import annotations

import base64
import binascii

from fastapi import HTTPException, status

# AES-256-GCM parameters used by the frontend (see lib/crypto/aesGcm.ts).
GCM_IV_BYTES = 12
ARGON2_SALT_BYTES = 16


def decode_b64(value: str, field: str, *, expected_len: int | None = None) -> bytes:
    """
    Decode *value* as strict base64, or raise 400.

    ``validate=True`` matters: the permissive default silently discards
    characters outside the base64 alphabet, so a corrupted ciphertext would be
    stored happily and only fail much later, in the browser, as an
    indistinguishable-from-tampering GCM authentication error.
    """
    try:
        decoded = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
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
