"""Server-side cryptographic helpers — Argon2id password hashing, audit IP hashing."""
from __future__ import annotations

import asyncio
import hashlib

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

# Argon2id parameters — OWASP recommended minimums for 2024
_ph = PasswordHasher(
    time_cost=3,       # iterations
    memory_cost=65536, # 64 MB
    parallelism=4,
    hash_len=32,
    salt_len=16,
)


def hash_password(plaintext: str) -> str:
    """Return Argon2id hash of *plaintext*. Include the full encoded hash string."""
    return _ph.hash(plaintext)


def verify_password(plaintext: str, hashed: str) -> bool:
    """Return True if *plaintext* matches *hashed*. Constant-time comparison."""
    try:
        return _ph.verify(hashed, plaintext)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


# Verified when an account has no password hash, so a miss costs the same Argon2 work as a hit.
DUMMY_PASSWORD_HASH = (
    "$argon2id$v=19$m=65536,t=3,p=4$fakesaltfakesalt$fakehashfakehashfakehashfakehash"  # noqa: S105
)


async def hash_password_async(plaintext: str) -> str:
    """`hash_password` off the event loop: Argon2id takes a core for tens of milliseconds."""
    return await asyncio.to_thread(hash_password, plaintext)


async def verify_password_async(plaintext: str, hashed: str | None) -> bool:
    """`verify_password` off the event loop; a missing *hashed* checks the dummy hash and fails."""
    ok = await asyncio.to_thread(verify_password, plaintext, hashed or DUMMY_PASSWORD_HASH)
    return ok and hashed is not None


def needs_rehash(hashed: str) -> bool:
    """Return True if the hash was made with outdated parameters."""
    return _ph.check_needs_rehash(hashed)


def hash_ip(ip: str) -> str | None:
    """Return hex-encoded SHA-256 of *ip* for privacy-safe audit logging."""
    if not ip:
        return None
    return hashlib.sha256(ip.encode()).hexdigest()
