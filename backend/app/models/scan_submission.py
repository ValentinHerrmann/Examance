"""ScanSubmission model — encrypted scan + annotation storage."""
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    LargeBinary,
    String,
    func,
)
from sqlalchemy.orm import Mapped, column_property, mapped_column

from app.database import Base


class ScanSubmission(Base):
    __tablename__ = "scan_submissions"

    # The identity FK spans both columns because student_identities is keyed by (pseudonym_hmac, exam_id) — a submission can only reference an identity registered under its own exam, which the database now enforces directly.
    __table_args__ = (
        ForeignKeyConstraint(
            ["pseudonym_hmac", "exam_id"],
            ["student_identities.pseudonym_hmac", "student_identities.exam_id"],
            ondelete="CASCADE",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    exam_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    pseudonym_hmac: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    total_score: Mapped[float | None] = mapped_column(Float, nullable=True)  # Plaintext for stats
    # The scan lives in exactly one of these: `scan_path` is a blob-store ref (services/blob_store), `scan_ciphertext` the in-DB copy. Read it through services/scan_storage, never directly.
    scan_path: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    scan_ciphertext: Mapped[bytes | None] = mapped_column(
        LargeBinary, nullable=True, deferred=True
    )
    # Presence of the in-DB copy without loading its bytes. Not expired on flush (an async lazy load would fail), so it reflects the row as loaded: writers track presence themselves.
    scan_in_db: Mapped[bool] = column_property(
        scan_ciphertext.column.is_not(None),  # type: ignore[attr-defined]
        expire_on_flush=False,
    )
    scan_iv: Mapped[bytes] = mapped_column(LargeBinary(12), nullable=False)
    annotation_ciphertext: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    annotation_iv: Mapped[bytes | None] = mapped_column(LargeBinary(12), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    retention_until: Mapped[date | None] = mapped_column(Date, nullable=True)

    def __repr__(self) -> str:
        return f"ScanSubmission(id={self.id!r}, exam={self.exam_id!r})"
