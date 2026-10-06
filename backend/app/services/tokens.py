"""Small helpers shared by the mailed single-use token flows (reset, registration, deletion)."""
from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from typing import Any, cast

from sqlalchemy import CursorResult


def hash_token(raw_token: str) -> str:
    """SHA-256 of a mailed token; only this hash is stored."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def aware(moment: datetime) -> datetime:
    """SQLite (tests) returns naive timestamps; they were written in UTC."""
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)


def rowcount(result: Any) -> int:
    """Affected rows of a DML result (`AsyncSession.execute` is typed as the base `Result`)."""
    return cast("CursorResult[Any]", result).rowcount
