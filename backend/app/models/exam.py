"""Exam model."""
from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Date, DateTime, Enum, ForeignKey, SmallInteger, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.exercise import Exercise


class Exam(Base):
    __tablename__ = "exams"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    latex_template: Mapped[str] = mapped_column(Text, nullable=False, default="")
    compilation_status: Mapped[str] = mapped_column(
        Enum("pending", "compiled", "failed", name="compilation_status"),
        nullable=False,
        default="pending",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    retention_until: Mapped[date] = mapped_column(Date, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Last time retention erased soft-deleted results of this (live) exam for good; reported by restore (issue #181).
    results_purged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # How this exam's server rows derive pseudonym_hmac: 1 = SHA-256 of the raw id, 2 = keyed per-exam HMAC (issue #177); changed only by the rekey endpoint.
    pseudonym_version: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=1, server_default="1"
    )

    testart: Mapped[str | None] = mapped_column(String(100), nullable=True)
    grade: Mapped[str | None] = mapped_column(String(50), nullable=True)
    klasse: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Printed course (\Klasse) when set; empty means grade + klasse (issue #212).
    course: Mapped[str | None] = mapped_column(String(50), nullable=True)
    datum: Mapped[str | None] = mapped_column(String(100), nullable=True)
    nr: Mapped[str | None] = mapped_column(String(10), nullable=True)
    fach: Mapped[str | None] = mapped_column(String(100), nullable=True)
    topic: Mapped[str | None] = mapped_column(String(200), nullable=True)
    lehrernachname: Mapped[str | None] = mapped_column(String(100), nullable=True)
    info_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    grading_key: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    # Package entries on top of the account's (issue #108); null follows the account.
    latex_packages: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    # Item ids (exercise or MC group) that start on a new page; plaintext layout metadata.
    page_breaks: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    # Adds a handwritten name line next to the QR sticker box (issue #127).
    name_line: Mapped[bool] = mapped_column(nullable=False, default=False, server_default="false")
    # Prints a correction legend at every MC task (issue #192).
    mc_correction_hint: Mapped[bool] = mapped_column(nullable=False, default=False, server_default="false")
    # Multi-sheet layout (issue #220): a page code on every page; off keeps the pre-#220 layout of older exams.
    page_codes: Mapped[bool] = mapped_column(nullable=False, default=False, server_default="false")
    # "duplex" (2 pages per sheet) or "booklet" (4 per folded A3 sheet); sets the padding multiple.
    print_layout: Mapped[str] = mapped_column(String(10), nullable=False, default="duplex", server_default="duplex")
    # Sticker spots in sticker mode: "cover", "sheet" (every sheet front), "a3" (every booklet sheet), "leaf" (every cut booklet leaf).
    sticker_spots: Mapped[str] = mapped_column(String(10), nullable=False, default="cover", server_default="cover")
    # "stickers" (plain sheet + QR stickers) or "copies" (personalised copies); the sheet's sticker spots follow it.
    print_mode: Mapped[str] = mapped_column(String(10), nullable=False, default="stickers", server_default="stickers")
    # Pattern of every page meant for writing (issue #228): "empty", "squared" (5 mm) or "lined" (8 mm).
    paper_style: Mapped[str] = mapped_column(String(10), nullable=False, default="empty", server_default="empty")
    # Writing pages after the points table in every copy (issue #228), page-coded like any page.
    extra_pages: Mapped[int] = mapped_column(nullable=False, default=0, server_default="0")
    # Horizontal shift of imposed A3 booklet sheets in mm (issue #228), so a printer that prints off-centre comes out centred.
    booklet_offset_mm: Mapped[float] = mapped_column(nullable=False, default=0.0, server_default="0")
    # False when graded outside Examance (issue #228): no scan aids printed, a name line instead.
    digital_grading: Mapped[bool] = mapped_column(nullable=False, default=True, server_default="true")
    # Without digital grading: page 1 keeps one box for a results QR sticker.
    results_qr_box: Mapped[bool] = mapped_column(nullable=False, default=False, server_default="false")
    # Karo block at the end (issue #156): {title, min/max_height_cm}; null = off.
    extra_notes: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    # Ticks the teacher sets by hand per step (print checklist, MC check); the client owns the shape.
    step_checks: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    # Overview-list flags (issue #252); never copied by Duplicate.
    is_favorite: Mapped[bool] = mapped_column(nullable=False, default=False, server_default="false")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    exercises: Mapped[list[Exercise]] = relationship(
        "Exercise", backref="exam", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"Exam(id={self.id!r}, title={self.title!r})"
