"""A pending self-deletion, confirmed through the mailed single-use link."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AccountDeletionRequest(Base):
    __tablename__ = "account_deletion_requests"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # One open request per account; a new request replaces it.
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    # Library exercises stay on the server without an owner (for future sharing).
    keep_exercises: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"AccountDeletionRequest(id={self.id!r}, teacher_id={self.teacher_id!r})"
