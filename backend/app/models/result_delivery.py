"""Delivery status of one student's result message (issue #221, docs/dev/result_sharing.md): sent, failed, bounced or delayed, per exam, student and channel."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ResultDelivery(Base):
    """Read and written only by `app.services.result_deliveries`. Never holds an address, name or link: the student is only their pseudonym."""

    __tablename__ = "result_deliveries"
    __table_args__ = (
        UniqueConstraint("exam_id", "student_key", "channel", name="uq_result_deliveries_student"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    exam_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # The student's version-2 pseudonym (`joinKey`), as in `result_shares`.
    student_key: Mapped[str] = mapped_column(String(64), nullable=False)
    # "email" or "artemis".
    channel: Mapped[str] = mapped_column(String(16), nullable=False)
    # "sent", "failed", "bounced" or "delayed".
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    # Address-free reason: an SMTP enhanced status such as "5.1.1", or the Artemis relay's error text.
    detail: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Random token in the mail's Message-ID, which a bounce quotes back; e-mail only.
    mail_token: Mapped[str | None] = mapped_column(String(32), nullable=True, unique=True)
    # Until then the teacher's open dialog shows bounces; later ones are forwarded to the teacher by mail.
    watch_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    def __repr__(self) -> str:
        return f"ResultDelivery(exam={self.exam_id!r}, channel={self.channel!r}, status={self.status!r})"
