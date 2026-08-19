"""ExerciseResource model — teacher-uploaded files referenced from LaTeX."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ExerciseResource(Base):
    """
    A binary file attached to one exercise (figure, data file, ...).

    ``content`` is stored in plaintext, exactly like ``Exercise.latex_body``:
    an exercise that lives on the server is server-readable by design (see
    docs/data_flow_and_security.md), and Tectonic cannot compile ciphertext.
    Teachers who need zero-knowledge storage use the default all-local mode,
    where the bytes are AES-256-GCM encrypted in IndexedDB instead.

    ``filename`` is the sanitised, flat name the LaTeX source references
    (``\\includegraphics{figure.png}``); it is unique per exercise.
    """

    __tablename__ = "exercise_resources"
    __table_args__ = (
        UniqueConstraint("exercise_id", "filename", name="uq_exercise_resource_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    exercise_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exercises.id", ondelete="CASCADE"), nullable=False, index=True
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(
        String(150), nullable=False, default="application/octet-stream"
    )
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return (
            f"ExerciseResource(id={self.id!r}, exercise={self.exercise_id!r}, "
            f"name={self.filename!r})"
        )
