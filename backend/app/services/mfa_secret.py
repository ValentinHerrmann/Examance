"""
Encryption for TOTP shared secrets at rest. Cannot be zero-knowledge (the server computes the
code), but the key derives from SECRET_KEY (environment, not database), so a DB dump alone
yields no seeds. Rotating SECRET_KEY invalidates every TOTP enrollment, as it does every session.
"""
from __future__ import annotations

import hashlib
import hmac
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.config import settings

_INFO = b"examance-mfa-secret-v1"
_BACKUP_INFO = b"examance-backup-code-v1"
_IV_BYTES = 12


def _derive(info: bytes) -> bytes:
    """HKDF-Extract-then-Expand over SECRET_KEY, one output block."""
    prk = hmac.new(b"examance-mfa", settings.SECRET_KEY.encode("utf-8"), hashlib.sha256).digest()
    return hmac.new(prk, info + b"\x01", hashlib.sha256).digest()


def _wrapping_key() -> bytes:
    return _derive(_INFO)


def backup_code_digest(normalized_code: str) -> str:
    """
    Keyed digest of a backup code, for storage and lookup. Deliberately not a password hash: the
    code is ~50 bits of `secrets.choice`, so Argon2id has nothing to slow and only blocks the event
    loop. Keying from SECRET_KEY defeats a DB dump alone.
    """
    mac = hmac.new(_derive(_BACKUP_INFO), normalized_code.encode("utf-8"), hashlib.sha256)
    return mac.hexdigest()


def encrypt_secret(secret: bytes) -> tuple[bytes, bytes]:
    """Return (ciphertext, iv) for *secret*."""
    iv = os.urandom(_IV_BYTES)
    ciphertext = AESGCM(_wrapping_key()).encrypt(iv, secret, _INFO)
    return ciphertext, iv


def decrypt_secret(ciphertext: bytes, iv: bytes) -> bytes:
    """
    Recover a stored secret. Raises `cryptography.exceptions.InvalidTag` when SECRET_KEY has
    changed, which is correct: the enrollment is gone and the teacher must re-enroll.
    """
    return AESGCM(_wrapping_key()).decrypt(iv, ciphertext, _INFO)
