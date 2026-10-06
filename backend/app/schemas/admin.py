"""Pydantic schemas for Admin endpoints."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    teacher_id: uuid.UUID | None
    teacher_email: str
    action: str
    target_hash: str | None
    ip_hash: str | None
    created_at: datetime


class ClassStatsResponse(BaseModel):
    exam_id: uuid.UUID
    total_submissions: int
    mean_score: float | None
    std_dev: float | None
    k_anonymity_satisfied: bool
    suppressed_reason: str | None = None


class AccountFeatures(BaseModel):
    """The per-account switches an admin sets (app/services/capabilities.py).

    server_results: results and student data may live on the server ("all-server").
    server_latex: LaTeX may be compiled on the server. Exams and exercises need no switch."""

    model_config = ConfigDict(extra="forbid")

    server_results: bool = True
    server_latex: bool = True


class AccountFeaturesUpdate(BaseModel):
    """A partial change of `AccountFeatures`; omitted switches stay as they are."""

    model_config = ConfigDict(extra="forbid")

    server_results: bool | None = None
    server_latex: bool | None = None


class AdminCreateUserRequest(BaseModel):
    """An invitation: the account is created approved, the address counts as verified."""

    email: EmailStr
    role: Literal["teacher", "admin"] = "teacher"
    features: AccountFeatures = Field(default_factory=AccountFeatures)


class AdminApproveRequest(BaseModel):
    features: AccountFeatures = Field(default_factory=AccountFeatures)


class AdminUserResponse(BaseModel):
    id: uuid.UUID
    email: str
    role: Literal["teacher", "admin"]
    created_at: datetime
    # Null while the account waits for approval.
    approved_at: datetime | None
    # The registrant's note to the admin; only set while pending.
    registration_note: str | None
    features: AccountFeatures
    # False for an invitation nobody has accepted yet ("resend invite").
    password_set: bool


class AdminUserList(BaseModel):
    items: list[AdminUserResponse]
    total: int


class AllowedDomainRequest(BaseModel):
    domain: str = Field(min_length=1, max_length=254)
    features: AccountFeatures = Field(default_factory=AccountFeatures)


class AllowedDomainResponse(BaseModel):
    id: uuid.UUID
    domain: str
    features: AccountFeatures
    created_at: datetime


class AdminCreateUserResponse(BaseModel):
    id: uuid.UUID
    email: str
    role: Literal["teacher", "admin"]
    created_at: datetime
    password_reset_sent: bool = True


class AdminResetPasswordResponse(BaseModel):
    message: str
    user_id: uuid.UUID
    password_reset_sent: bool = True
