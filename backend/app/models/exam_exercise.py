"""ExamExercise junction model."""
from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ExamExercise(Base):
    __tablename__ = "exam_exercises"

    exam_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exams.id", ondelete="CASCADE"), primary_key=True
    )
    exercise_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exercises.id", ondelete="CASCADE"), primary_key=True
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # SET NULL, not CASCADE: dissolving an MC group must leave its member
    # exercises linked to the exam as standalone items. With CASCADE, deleting a
    # group deleted the junction rows and the exercises silently dropped out of
    # the exam.
    mc_group_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("exam_mc_groups.id", ondelete="SET NULL"), nullable=True, index=True
    )
    sub_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
