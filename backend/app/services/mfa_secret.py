"""
Encryption for TOTP shared secrets at rest.

Unlike everything else in this system, this key material cannot be
zero-knowledge: the server has to compute the expected code, so it has to be
able to read the secret. What this buys is narrower but real — a stolen database
dump on its own does not yield working authenticator seeds, because the key is
derived from SECRET_KEY, which lives in the environment rather than the
database.

Consequence worth stating plainly: rotating SECRET_KEY invalidates every TOTP
enrollment. It already invalidates every session, so the blast radius grows
rather than changes shape, but it does grow.
"""
from __future__ import annotations

import hashlib
import hmac
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import settings

_INFO = b"examance-mfa-secret-v1"
_IV_BYTES = 12


def _wrapping_key() -> bytes:
    """HKDF-Extract-then-Expand over SECRET_KEY, one output block."""
    prk = hmac.new(b"examance-mfa", settings.SECRET_KEY.encode("utf-8"), hashlib.sha256).digest()
    return hmac.new(prk, _INFO + b"\x01", hashlib.sha256).digest()


def encrypt_secret(secret: bytes) -> tuple[bytes, bytes]:
    """Return (ciphertext, iv) for *secret*."""
    iv = os.urandom(_IV_BYTES)
    ciphertext = AESGCM(_wrapping_key()).encrypt(iv, secret, _INFO)
    return ciphertext, iv


def decrypt_secret(ciphertext: bytes, iv: bytes) -> bytes:
    """
    Recover a stored secret.

    Raises `cryptography.exceptions.InvalidTag` when SECRET_KEY has changed —
    which is the correct outcome: the enrollment is gone and the teacher must
    re-enroll, rather than the server silently accepting nothing.
    """
    return AESGCM(_wrapping_key()).decrypt(iv, ciphertext, _INFO)
