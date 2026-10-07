"""Proposals from a linked copy back to the shared original (issue #65)."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Enum, Float, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

CONTRIBUTION_STATUSES = ("pending", "accepted", "rejected", "withdrawn")


class ExerciseContribution(Base):
    """An immutable snapshot the owner accepts (as a new version/variant) or rejects.

    The payload is cleared once decided; only the decision is kept until retention drops the row."""

    __tablename__ = "exercise_contributions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    contributor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_group_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exercise_groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # No FKs: the rows may be superseded or deleted; the proposal must outlive that.
    target_exercise_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    from_exercise_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    kind: Mapped[str] = mapped_column(
        Enum("version", "variant", name="contribution_kind"), nullable=False
    )
    variant_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    latex_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    question_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    correct_answers: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    penalty: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    max_points: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    message: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    base_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(
        Enum(*CONTRIBUTION_STATUSES, name="contribution_status"),
        nullable=False,
        default="pending",
        index=True,
    )
    decision_note: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(UTC)
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    result_exercise_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)


class ExerciseContributionResource(Base):
    """The contributor's files at submission, so the owner reviews exactly what was sent."""

    __tablename__ = "exercise_contribution_resources"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    contribution_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exercise_contributions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(150), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
