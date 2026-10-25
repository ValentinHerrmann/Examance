"""Teacher reports of LaTeX layout problems for the admins (issue #134)."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, deferred, mapped_column

from app.database import Base

LAYOUT_REPORT_KINDS = ("exam", "exercise")
LAYOUT_REPORT_STATUSES = ("open", "done")


class LayoutReport(Base):
    """A plaintext snapshot the teacher chose to share with the admins (per-report consent).

    Cascades with the reporter's account; retention drops it after LAYOUT_REPORT_RETENTION_DAYS."""

    __tablename__ = "layout_reports"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    reporter_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    # Admin-only; never part of the GitHub text.
    source_title: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    engine: Mapped[str] = mapped_column(String(16), nullable=False)
    app_version: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    problem: Mapped[str] = mapped_column(Text, nullable=False)
    expected: Mapped[str] = mapped_column(Text, nullable=False)
    compile_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open", index=True)
    resolution_note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC), index=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class LayoutReportFile(Base):
    """LaTeX sources, compiled PDFs and resources attached to a report."""

    __tablename__ = "layout_report_files"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    report_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("layout_reports.id", ondelete="CASCADE"), nullable=False, index=True
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(150), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    content: Mapped[bytes] = deferred(mapped_column(LargeBinary, nullable=False))
