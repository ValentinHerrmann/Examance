"""AuditLog model — immutable compliance record, never soft-deleted."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # Nullable FK — ON DELETE SET NULL so deleting a teacher account does NOT
    # cascade-delete or block removal of audit records.
    teacher_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Immutable snapshot — survives teacher account deletion for compliance.
    teacher_email: Mapped[str] = mapped_column(String(255), nullable=False)
    action: Mapped[str] = mapped_column(
        Enum(
            "LOGIN",
            "EXPORT",
            "DELETE",
            "VIEW",
            "EXTEND_RETENTION",
            "CREATE_USER",
            "PASSWORD_RESET_REQUESTED",
            "PASSWORD_RESET_COMPLETED",
            # Written by admin.py when an outbound mail fails. These were being
            # written before they were enum members, which Postgres rejects.
            "CREATE_USER_EMAIL_FAILED",
            "PASSWORD_RESET_EMAIL_FAILED",
            # Authentication hardening.
            "LOGIN_FAILED",
            "ACCOUNT_LOCKED",
            "MFA_ENROLLED",
            "MFA_DISABLED",
            "PASSKEY_REGISTERED",
            "PASSKEY_REMOVED",
            "KEY_ENVELOPE_RESET",
            "ORPHANED_DATA_DELETED",
            # Account registration and approval (issue #53).
            "USER_REGISTERED",
            "USER_APPROVED",
            "USER_REJECTED",
            "USER_FEATURES_CHANGED",
            "ALLOWED_DOMAIN_ADDED",
            "ALLOWED_DOMAIN_CHANGED",
            "ALLOWED_DOMAIN_REMOVED",
            # Written by /auth/change-password since it shipped, but never an enum member,
            # which Postgres rejects. Added with migration 0028.
            "PASSWORD_CHANGED",
            # A self-deletion link was mailed (migration 0029).
            "DELETION_REQUESTED",
            # Exercise sharing (issue #65, migration 0030).
            "EXERCISE_SHARING_CHANGED",
            "EXERCISE_COPIED",
            "EXERCISE_RESYNCED",
            name="audit_action",
        ),
        nullable=False,
    )
    target_hash: Mapped[str | None] = mapped_column(
        String(64), nullable=True  # SHA-256 of affected exam_id or pseudonym_hmac
    )
    ip_hash: Mapped[str | None] = mapped_column(
        String(64), nullable=True  # SHA-256 of request IP
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # AuditLog rows are append-only (never soft-deleted or edited) but hard-deleted after
    # AUDIT_LOG_RETENTION_DAYS (services/retention.py): they hold teacher_email and ip_hash, which
    # Art. 17(3) justifies keeping for a defined period, not forever.

    def __repr__(self) -> str:
        return (
            f"AuditLog(id={self.id!r}, action={self.action!r}, "
            f"teacher={self.teacher_email!r})"
        )
