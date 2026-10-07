"""Teacher (user) model."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, String, false, func, true
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# Storage modes (docs/dev/storage_modes.md). Exams and exercises always live on the server; the
# mode only decides whether grading results do too ("all-server") or stay in one browser
# ("hybrid"). Which modes an account may use: app/services/capabilities.py.
STORAGE_MODES = ("all-server", "hybrid")


class Teacher(Base):
    __tablename__ = "teachers"
    __table_args__ = (
        CheckConstraint(
            "storage_mode IS NULL OR storage_mode IN ('all-server', 'hybrid')",
            name="ck_teachers_storage_mode",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    # Argon2id; None until the teacher sets a password via the reset link.
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(
        Enum("teacher", "admin", name="teacher_role"),
        nullable=False,
        default="teacher",
    )
    # Mirror of the Redis-held login cooloff (app/services/login_throttle.py), so
    # flushing Redis cannot silently clear a lock and an operator can read the
    # state out of the database. Always in the future or None; never permanent.
    locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Factor activity, shown on the security page. Null means "not recorded
    # since this shipped" — deliberately not backfilled from created_at, which
    # would state a change that may never have happened.
    password_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    password_last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # The account's storage mode. Null until the teacher chooses one explicitly; there is no
    # default, and nothing writes it implicitly. Every browser of the account follows this value.
    storage_mode: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # When an admin (or an always-allowed domain) approved the account; null = pending, which holds
    # no token of any kind (`advance_sign_in` in app/routers/auth.py, app/dependencies.py). No
    # default on purpose: a write path that forgets it locks the account out, never one in.
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Optional note a self-registered teacher leaves for the approving admin. Erased on approval.
    registration_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Per-account feature switches set by an admin (app/services/capabilities.py): whether results
    # may live on the server ("all-server"), whether LaTeX may compile there, and whether the
    # account may share and copy exercises (issue #65). Both the Python and the server default are
    # needed: without the former a fresh row leaves them unloaded.
    allow_server_results: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )
    allow_server_latex: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )
    allow_exercise_sharing: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )
    # The teacher's own pause (issue #65): hides everything they share, keeps the per-group choice.
    sharing_paused: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"Teacher(id={self.id!r}, email={self.email!r}, role={self.role!r})"
