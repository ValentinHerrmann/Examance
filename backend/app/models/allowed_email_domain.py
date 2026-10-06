"""Always-allowed e-mail domains: self-registrations from these are approved automatically."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func, true
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AllowedEmailDomain(Base):
    """
    An admin-maintained domain (exact match on the part after '@', lowercased).

    A verified registration from this domain is approved on the spot with the features stored
    here. Changing a row only affects future registrations, never existing accounts.
    """

    __tablename__ = "allowed_email_domains"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    domain: Mapped[str] = mapped_column(String(253), unique=True, index=True, nullable=False)
    allow_server_results: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )
    allow_server_latex: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=true()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"AllowedEmailDomain(domain={self.domain!r})"
