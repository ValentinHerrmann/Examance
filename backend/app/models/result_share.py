"""Result share: one student's graded PDF, sealed in the teacher's browser with a key only the student's link (plus an optional code) yields (issue #207, docs/dev/result_sharing.md)."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, deferred, mapped_column

from app.database import Base


class ResultShare(Base):
    """Read and written only by `app.services.result_shares`. The server holds ciphertext it can never open: no token, no code, no name."""

    __tablename__ = "result_shares"
    __table_args__ = (UniqueConstraint("exam_id", "student_key", name="uq_result_shares_student"),)

    # Minted by the browser: it is part of the student's link and the AAD of the ciphertext.
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    exam_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # The student's version-2 pseudonym (`joinKey`): stable across a re-key, opaque to the server.
    student_key: Mapped[str] = mapped_column(String(64), nullable=False)
    # SHA-256 hex of the lookup secret the link derives; the student proves the link by sending the secret.
    lookup_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    # "none" (link only), "sticker" (personal key from the sticker sheet) or "code" (code from the slips).
    factor: Mapped[str] = mapped_column(String(16), nullable=False)
    kdf_salt: Mapped[bytes | None] = mapped_column(LargeBinary(16), nullable=True)
    iv: Mapped[bytes] = mapped_column(LargeBinary(12), nullable=False)
    # Exactly one of the two holds the ciphertext, like scans (`blob_store` kind "shares").
    blob_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ciphertext: Mapped[bytes | None] = deferred(mapped_column(LargeBinary, nullable=True))
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )

    def __repr__(self) -> str:
        return f"ResultShare(id={self.id!r}, exam={self.exam_id!r}, factor={self.factor!r})"
