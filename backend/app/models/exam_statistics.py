"""ExamStatistics model: a teacher's anonymised, client-sealed statistics of one exam, kept after its results are purged (issue #238)."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, LargeBinary, func, true
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _now() -> datetime:
    return datetime.now(UTC)


class ExamStatistics(Base):
    """One statistics record per exam. The payload is opaque ciphertext of an unlinked, shuffled score matrix (never a pseudonym or submission id)."""

    __tablename__ = "exam_statistics"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # No FK: an exam delete removes the exam row into the trash at once, and the record must outlive it (issue #238).
    exam_id: Mapped[uuid.UUID] = mapped_column(nullable=False, unique=True)
    keep_after_exam_delete: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )
    payload_ciphertext: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    payload_iv: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    # Client clock of the computation; a stale write never replaces a newer one.
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"ExamStatistics(exam={self.exam_id!r})"
