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

    The shared secret is encrypted with a key derived from SECRET_KEY (see
    `app/services/mfa_secret.py`) rather than stored raw: the server must be able
    to compute the expected code, so this is not zero-knowledge, but a database
    dump on its own does not hand over working seeds.
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

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class MfaBackupCode(Base):
    """
    A single-use stand-in for the authenticator app.

    `code_hash` holds a keyed digest (`mfa_secret.backup_code_digest`), not a
    password hash: a backup code is machine-generated with no dictionary behind
    it, so Argon2id bought nothing and cost ten 64 MB hashes per issued set.
    Sets issued before that change are Argon2id hashes and are still accepted —
    they cannot be converted, since the plaintext is gone — and are replaced by
    digests when the teacher regenerates.
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
