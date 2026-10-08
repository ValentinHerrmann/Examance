"""TOTP enrollment and its single-use backup codes."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, LargeBinary, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MfaCredential(Base):
    """
    One authenticator-app enrollment per teacher.

    The secret is encrypted under a key derived from SECRET_KEY (`app/services/mfa_secret.py`):
    not zero-knowledge (the server computes codes), but a database dump alone yields no seeds.
    """

    __tablename__ = "mfa_credentials"

    teacher_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teachers.id", ondelete="CASCADE"), primary_key=True
    )
    secret_ct: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    secret_iv: Mapped[bytes] = mapped_column(LargeBinary(12), nullable=False)

    # Null until the teacher proves they can produce a code. An unconfirmed row
    # does not count as an enrolled factor, so a half-finished enrollment can
    # never satisfy the login policy.
    confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Highest time step already accepted. A code stays valid for 30 seconds, so
    # without this one observed over a shoulder could be replayed inside that
    # window.
    last_used_step: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Wall-clock counterpart to `last_used_step`, for the security page. The step
    # could be multiplied out, but only for codes — a backup code standing in for
    # the authenticator moves this and not that.
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class MfaBackupCode(Base):
    """
    A single-use stand-in for the authenticator app.

    `code_hash` is a keyed digest (`mfa_secret.backup_code_digest`), not Argon2id (machine-made
    codes). Legacy Argon2id hashes stay valid until the set is regenerated.
    """

    __tablename__ = "mfa_backup_codes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
