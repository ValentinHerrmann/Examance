"""Pending self-registration: an address that asked for an account but has not verified it yet."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RegistrationRequest(Base):
    """One row per address awaiting verification (app/services/registration.py).

    No teacher row exists until the mailed link is used. The token is stored as a SHA-256 hash;
    expired rows are removed by the retention job."""

    __tablename__ = "registration_requests"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # When the last verification mail went out; drives the per-address resend cooldown.
    last_sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"RegistrationRequest(id={self.id!r})"
