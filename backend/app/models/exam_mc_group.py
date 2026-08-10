"""ExamMcGroup model — groups MC sub-exercises into one Aufgabe block."""
from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.exam_exercise import ExamExercise


class ExamMcGroup(Base):
    __tablename__ = "exam_mc_groups"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    exam_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="Grundlagen")
    scoring_text: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default=(
            "Für jedes korrekte Kreuz 1BE; für jedes falsche Kreuz -0,5BE. "
            "Pro Teilaufgabe aber immer $\\geq$0BE"
        ),
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    members: Mapped[list[ExamExercise]] = relationship(
        "ExamExercise",
        foreign_keys="ExamExercise.mc_group_id",
        cascade="all, delete-orphan",
    )
