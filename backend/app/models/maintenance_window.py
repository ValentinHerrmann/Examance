"""MaintenanceWindow model: the single announced maintenance or deployment window (issue #130)."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# The maintenance-backup service in deploy/docker-compose.deploy.yml claims and reports backups with plain SQL against this table: keep column names and the backup_state values in sync with it.


class MaintenanceWindow(Base):
    __tablename__ = "maintenance_window"

    # Always 1: there is at most one window, a new start replaces it.
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # manual | deployment
    downtime_class: Mapped[str] = mapped_column(String(16), nullable=False)
    first_warning_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    second_warning_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Deployments only: set by CI right before the backup and restart; `down` starts here.
    frozen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    auto_end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_by_teacher_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True
    )
    backup_wanted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    backup_state: Mapped[str | None] = mapped_column(String(16), nullable=True)
    backup_file: Mapped[str | None] = mapped_column(String(255), nullable=True)
    backup_finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    offsite_state: Mapped[str | None] = mapped_column(String(16), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"MaintenanceWindow(revision={self.revision!r}, kind={self.kind!r})"
