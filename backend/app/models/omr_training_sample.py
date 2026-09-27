"""OmrTrainingSample — one anonymous, teacher-verified MC answer-box crop."""
from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from sqlalchemy import JSON, Boolean, Date, Integer, LargeBinary, SmallInteger, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class OmrTrainingSample(Base):
    """
    Opt-in training data for a shared MC-box classifier.

    Deliberately unlinked: no foreign key, no teacher, exam, submission or pupil id,
    no IP, and only a day-granular date (needed for retention). A row is a small
    grayscale crop of one checkbox (plus its redo zone) and the teacher-verified
    label — see docs/data_flow_and_security.md "Training-data donation".
    """

    __tablename__ = "omr_training_samples"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    created_on: Mapped[date] = mapped_column(
        Date, server_default=func.current_date(), nullable=False, index=True
    )
    schema_version: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    algorithm_version: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    label_selected: Mapped[bool] = mapped_column(Boolean, nullable=False)
    crop_width: Mapped[int] = mapped_column(Integer, nullable=False)
    crop_height: Mapped[int] = mapped_column(Integer, nullable=False)
    crop: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    meta: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)

    def __repr__(self) -> str:
        return f"OmrTrainingSample(id={self.id!r}, label={self.label_selected!r})"
