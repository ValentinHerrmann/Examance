"""GradingReview model: the sealed objection thread of one submission (issue #226)."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, LargeBinary, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class GradingReview(Base):
    """One client-sealed payload per submission (objection, reply, points before and after); no plaintext column, like scores."""

    __tablename__ = "grading_reviews"
    __table_args__ = (UniqueConstraint("submission_id", name="uq_grading_review_submission"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    exam_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    submission_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("scan_submissions.id", ondelete="CASCADE"), nullable=False, index=True
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
        return f"GradingReview(submission={self.submission_id!r})"
