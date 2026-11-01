"""Trash entry: an exact copy of what one teacher delete removed, kept for RETENTION_GRACE_DAYS (issue #125, docs/dev/trash.md)."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TrashItem(Base):
    """Rows of one delete, written and read only by `app.services.trash`. Encrypted columns stay encrypted inside `payload`."""

    __tablename__ = "trash_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # One UI action (client header X-Trash-Group); restore and purge act on a whole group.
    group_id: Mapped[uuid.UUID] = mapped_column(nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    # No FK: the exam may be in this very entry. Used for labels only.
    exam_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    # Ids, plaintext titles, row counts and the sealed student identity the browser decrypts.
    label: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    # zlib-compressed JSON {"rows": {table: [row]}, "fills": [...], "meta": {...}}.
    payload: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    # Scan files (blob refs) the payload's rows point at; the blob sweep keeps them.
    blob_refs: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    purge_after: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )

    def __repr__(self) -> str:
        return f"TrashItem(id={self.id!r}, kind={self.kind!r}, group={self.group_id!r})"
