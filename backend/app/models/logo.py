"""Exam header logos — an account default and an optional per-exam override (issue #46)."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# What an exam does with its logo slot. No ExamLogo row means "use the account logo".
EXAM_LOGO_MODES = ("none", "custom")


class TeacherLogo(Base):
    """
    The logo printed in the header of every exam of the account, unless the exam overrides it.

    ``content`` is plaintext for the same reason as ``ExerciseResource.content``: Tectonic
    compiles it, and a school logo is printed on every handed-out sheet anyway. Only PNG, JPEG
    and PDF are accepted (``app.services.logo``), so the bytes are always an image.
    """

    __tablename__ = "teacher_logos"

    teacher_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teachers.id", ondelete="CASCADE"), primary_key=True
    )
    mime_type: Mapped[str] = mapped_column(String(32), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"TeacherLogo(teacher={self.teacher_id!r}, type={self.mime_type!r})"


class ExamLogo(Base):
    """
    An exam's deviation from the account logo: ``none`` prints no logo, ``custom`` prints
    ``content``. Deleting the row returns the exam to the account logo.
    """

    __tablename__ = "exam_logos"
    __table_args__ = (
        CheckConstraint("mode IN ('none', 'custom')", name="ck_exam_logos_mode"),
        CheckConstraint(
            "mode = 'none' OR content IS NOT NULL", name="ck_exam_logos_custom_content"
        ),
    )

    exam_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exams.id", ondelete="CASCADE"), primary_key=True
    )
    mode: Mapped[str] = mapped_column(String(8), nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    content: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"ExamLogo(exam={self.exam_id!r}, mode={self.mode!r})"
