"""
KeyEnvelope — a copy of the client's data key, wrapped by one recovery factor.

The random DEK is wrapped once per factor, so a password reset re-wraps it instead of
orphaning the vault. Only ciphertext and public salts/KDF params live here; KEKs stay client-side.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class KeyEnvelope(Base):
    __tablename__ = "key_envelopes"
    __table_args__ = (
        # One wrap per factor. `credential_id` distinguishes passkey wraps from
        # each other; it is NULL for the password and recovery wraps.
        UniqueConstraint("teacher_id", "kind", "credential_id", name="uq_key_envelope_factor"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(
        Enum("password", "recovery", "passkey", name="key_envelope_kind"), nullable=False
    )
    # The WebAuthn credential this wrap belongs to. Deliberately not a foreign
    # key: envelopes are introduced before the credential table exists, and a
    # dangling reference here is harmless — the wrap is simply unusable.
    credential_id: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)

    kdf: Mapped[str] = mapped_column(String(16), nullable=False)  # "argon2id" | "hkdf"
    kdf_salt: Mapped[bytes] = mapped_column(LargeBinary(16), nullable=False)
    kdf_params: Mapped[dict[str, int]] = mapped_column(JSON, nullable=False)

    # AES-256-GCM over {"v":1,"dek":…,"fallback":…,"legacy":…}. Carries the whole decrypt
    # chain: old records may only open under superseded PBKDF2 keys, available only at wrap time.
    wrapped_bundle: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    wrap_iv: Mapped[bytes] = mapped_column(LargeBinary(12), nullable=False)

    # Identifies the DEK generation, so a record can say which key sealed it.
    # Same value on every row of one envelope set.
    key_id: Mapped[bytes] = mapped_column(LargeBinary(16), nullable=False)
    envelope_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Set when a server-side password write (admin reset, CLI) orphaned this
    # wrap. The client treats an invalidated row as absent and recovers through
    # another factor.
    invalidated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"KeyEnvelope(teacher_id={self.teacher_id!r}, kind={self.kind!r})"
