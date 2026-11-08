"""OmrTemplatePin model: a printed exam's answer-sheet layout, sealed client-side (issue #239)."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _now() -> datetime:
    return datetime.now(UTC)


class OmrTemplatePin(Base):
    """One pinned answer-sheet layout of an exam. The payload is opaque ciphertext (no personal data); (exam_id, layout_hash) is the identity, so writes are idempotent."""

    __tablename__ = "omr_template_pins"
    __table_args__ = (
        UniqueConstraint("exam_id", "layout_hash", name="uq_omr_template_pin_layout"),
        CheckConstraint("source IN ('download', 'printed')", name="ck_omr_template_pins_source"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    exam_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    layout_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    # Source of the first pin; later pins of the same layout never change it.
    source: Mapped[str] = mapped_column(String(16), nullable=False)
    # Set in Python: Postgres now() is the transaction start, so pins of one transaction would tie and "newest first" would be arbitrary.
    pinned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, server_default=func.now(), nullable=False
    )
    last_pinned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, server_default=func.now(), nullable=False
    )
    payload_ciphertext: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    payload_iv: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)

    def __repr__(self) -> str:
        return f"OmrTemplatePin(exam={self.exam_id!r}, layout={self.layout_hash[:8]!r})"
