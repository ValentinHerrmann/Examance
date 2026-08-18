"""StudentIdentity model — server never sees the raw pseudonym_id."""
from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class StudentIdentity(Base):
    __tablename__ = "student_identities"

    # PK = (HMAC(raw_uuid, per_exam_secret), exam_id) — raw ID never leaves the client.
    #
    # The hmac is scoped to the exam, matching the documented data model
    # (docs/api_reference.md, docs/DPA_template.md) and the client-side Dexie
    # schema, which already keys students by (pseudonymId, examId). A pupil
    # therefore appears as an independent identity in each exam, and a workspace
    # can be imported into another account on the same server.
    pseudonym_hmac: Mapped[str] = mapped_column(String(64), primary_key=True)
    exam_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exams.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    pii_ciphertext: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)  # AES-256-GCM
    iv: Mapped[bytes] = mapped_column(LargeBinary(12), nullable=False)          # 12-byte GCM nonce
    encryption_salt: Mapped[bytes] = mapped_column(LargeBinary(16), nullable=False)  # Argon2id salt
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    retention_until: Mapped[date | None] = mapped_column(Date, nullable=True)

    def __repr__(self) -> str:
        return f"StudentIdentity(hmac={self.pseudonym_hmac[:8]!r}..., exam={self.exam_id!r})"
