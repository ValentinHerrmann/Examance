"""
KeyEnvelope — a copy of the client's data key, wrapped by one recovery factor.

The teacher's data-encryption key (DEK) used to be *derived* from their login
password, which meant a password reset produced a different key and silently
orphaned every vault. Instead the DEK is now random and stored here once per
factor that may unwrap it: the password, a printable recovery code, and each
PRF-capable passkey.

Nothing in this table lets the server read anything. It holds only ciphertext, a
public salt and public KDF parameters; the key-encryption keys are derived in the
browser from material that never leaves it. Changing a password re-wraps the same
DEK under a new key-encryption key, so no data has to be re-encrypted.
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

    # AES-256-GCM over {"v":1,"dek":…,"fallback":…,"legacy":…}. The bundle carries
    # the whole decrypt chain, not just the current key: a vault can still hold
    # records that only open under the superseded PBKDF2 keys, and this is the
    # only moment at which all of them are available together.
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
