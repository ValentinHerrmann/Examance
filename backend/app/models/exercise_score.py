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

    Until this table existed, per-question scores lived **only** in the client's
    Dexie ``exerciseScores`` store — in every storage mode, including
    ``all-server``, where ``lockSession()`` wipes IndexedDB on the idle timeout.
    Grading an exam on the server and walking away therefore destroyed every
    per-question score, MC selection and OMR result; only the submission's
    ``total_score`` survived.

    Unlike ``ScanSubmission.total_score`` there is **no plaintext score column**
    here. The client's ``encryptScore()`` already seals score, ``selectedOptions``
    and ``omrMeta`` together into one payload, and a per-question plaintext
    record of how a named pupil answered each item is a sharper disclosure than
    an exam total — it reconstructs the answer sheet. Server-side statistics
    work from ``scan_submissions.total_score``, which stays plaintext.

    Identity is ``(submission_id, exercise_id)``, not ``id``: that is the pair
    the client reconciles on, and making it unique is what lets the bulk write be
    an idempotent upsert instead of a 409 on every re-save.
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
