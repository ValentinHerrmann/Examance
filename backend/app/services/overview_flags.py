"""Favorite and archive flags of exams and exercise groups (issue #252)."""
from __future__ import annotations

from datetime import UTC, datetime


def archived_since(current: datetime | None, archived: bool) -> datetime | None:
    """The new `archived_at`: archiving again keeps the first date, so the archive order stays stable."""
    if not archived:
        return None
    return current or datetime.now(UTC)
