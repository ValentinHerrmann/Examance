"""
RFC 6238 TOTP, on the standard library.

Deliberately not a dependency. The algorithm below is HMAC plus a truncation
rule; `pyotp` would add a supply-chain surface larger than the code it replaces,
for something this repository can test directly.

The shared secret is stored encrypted (see `mfa_secret.py`). That is not
zero-knowledge — the server has to compute the expected code — but it means a
stolen database dump alone does not yield working authenticator seeds.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
from typing import NamedTuple
from urllib.parse import quote

# 30-second steps and 6 digits are what every authenticator app assumes.
TOTP_STEP_SECONDS = 30
TOTP_DIGITS = 6

# 20 bytes is the RFC 4226 recommendation and what SHA-1 HMAC consumes without
# rehashing. SHA-1 here is HMAC-SHA-1, which is not affected by the collision
# attacks on plain SHA-1 — and it is the only variant authenticator apps
# universally support.
TOTP_SECRET_BYTES = 20

# One step either side. Wider windows buy very little usability and multiply the
# number of codes an attacker may guess at any moment.
TOTP_DRIFT_STEPS = 1


def generate_secret() -> bytes:
    """A fresh random TOTP shared secret."""
    return secrets.token_bytes(TOTP_SECRET_BYTES)


def to_base32(secret: bytes) -> str:
    """Base32 without padding — the encoding `otpauth://` URIs use."""
    return base64.b32encode(secret).decode("ascii").rstrip("=")


def current_step(timestamp: int) -> int:
    """The RFC 6238 time step *timestamp* falls in."""
    return timestamp // TOTP_STEP_SECONDS


def generate_code(secret: bytes, step: int) -> str:
    """The 6-digit code for *secret* at time *step*."""
    digest = hmac.new(secret, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    truncated = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(truncated % (10**TOTP_DIGITS)).zfill(TOTP_DIGITS)


class CodeCheck(NamedTuple):
    """The outcome of checking one submitted code."""

    #: The step it matched, when the code is usable. None otherwise.
    step: int | None
    #: True when the code is genuine but its step has already been spent.
    replayed: bool


def verify_code(
    secret: bytes, code: str, timestamp: int, *, last_used_step: int | None
) -> CodeCheck:
    """
    Check *code*, saying both whether it is usable and whether it is a replay.

    Recording the matched step is what lets the caller refuse the same code a
    second time: within a 30-second window a code that has been observed once —
    over someone's shoulder, in a proxied request — would otherwise still work.

    The two failures are reported separately because they are not the same
    event. A spent code proves possession of the secret; it is the code the
    teacher's own app is showing, one window too late, which is what every
    sign-in immediately after a password reset produces. Calling that "invalid"
    sends them looking for a problem that fixes itself in thirty seconds, and
    counting it as a failed attempt walks them into a lockout.

    Comparison is constant-time, and every candidate step is evaluated before
    answering, so timing does not reveal which one matched.
    """
    candidate = code.strip().replace(" ", "")
    if len(candidate) != TOTP_DIGITS or not candidate.isdigit():
        return CodeCheck(None, False)

    now = current_step(timestamp)
    matched: int | None = None
    replayed = False
    for step in range(now - TOTP_DRIFT_STEPS, now + TOTP_DRIFT_STEPS + 1):
        # No early exit and no skipped step: the whole window is evaluated
        # whatever is found, so timing says nothing about which step matched.
        hit = hmac.compare_digest(generate_code(secret, step), candidate)
        spent = last_used_step is not None and step <= last_used_step
        if hit and spent:
            replayed = True
        elif hit:
            matched = step
    return CodeCheck(matched, replayed and matched is None)


def provisioning_uri(secret: bytes, account_email: str, issuer: str = "Examance") -> str:
    """
    The `otpauth://` URI an authenticator app scans.

    Rendered as a QR code in the browser from the bundled `qrcode` dependency —
    the Content-Security-Policy is `script-src 'self'`, so a third-party QR
    service is not an option, and the secret must not leave the browser anyway.
    """
    label = quote(f"{issuer}:{account_email}", safe="")
    params = "&".join(
        [
            f"secret={to_base32(secret)}",
            f"issuer={quote(issuer, safe='')}",
            "algorithm=SHA1",
            f"digits={TOTP_DIGITS}",
            f"period={TOTP_STEP_SECONDS}",
        ]
    )
    return f"otpauth://totp/{label}?{params}"
