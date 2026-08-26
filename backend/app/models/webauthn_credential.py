"""A registered passkey."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, LargeBinary, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class WebAuthnCredential(Base):
    """
    One passkey, as one of the account's sign-in factors.

    Nothing secret is stored here. The public key is public by construction, and
    `prf_salt` is the *input* to the authenticator's PRF extension rather than
    its output — the derived secret never leaves the browser, which is what lets
    a passkey also unwrap the data key without the server being able to.
    """

    __tablename__ = "webauthn_credentials"

    credential_id: Mapped[bytes] = mapped_column(LargeBinary, primary_key=True)
    teacher_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    public_key: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)

    # The spec's clone signal is a counter that goes *backwards*. Many platform
    # authenticators report a constant 0 instead of counting; treating 0 as
    # "not supported" is what keeps every iCloud-keychain passkey working.
    sign_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    transports: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    aaguid: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # 32 public bytes, fixed at registration, used as the PRF input so the same
    # authenticator always derives the same key-encryption key.
    prf_salt: Mapped[bytes] = mapped_column(LargeBinary(32), nullable=False)
    # Whether this authenticator actually implements PRF. Where it does not, the
    # passkey authenticates but cannot open the vault, and the UI has to say so
    # rather than letting the teacher believe they are covered.
    supports_prf: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    nickname: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
