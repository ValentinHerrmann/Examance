"""ExerciseScore model — one pupil's result for one exercise of one submission."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, LargeBinary, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ExerciseScore(Base):
    """
    Per-exercise grading result for one submission.

    No plaintext score column, unlike ``ScanSubmission.total_score``: score,
    selected options and OMR metadata travel as one client-sealed payload, and a
    per-question plaintext record would reconstruct the pupil's answer sheet.
    (submission_id, exercise_id) is the identity, which makes writes idempotent.
    """

    __tablename__ = "exercise_scores"
    __table_args__ = (
        UniqueConstraint("submission_id", "exercise_id", name="uq_exercise_score_pair"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    submission_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("scan_submissions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    exercise_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True
    )
    payload_ciphertext: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    payload_iv: Mapped[bytes | None] = mapped_column(LargeBinary(12), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"ExerciseScore(submission={self.submission_id!r}, exercise={self.exercise_id!r})"
