"""Result sharing with students (issue #207): the server only ever sees ciphertext, a lookup hash and an expiry."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ShareFactor = Literal["none", "sticker", "code"]
_HEX64 = r"^[0-9a-f]{64}$"


class ReviewReseal(BaseModel):
    """The thread of a kept link sealed again under its new content key (issue #310); each part only when the thread has it."""

    objection_iv_b64: str | None = None
    objection_ct_b64: str | None = None
    reply_iv_b64: str | None = None
    reply_ct_b64: str | None = None
    # The thread as the client read it; a thread changed since then refuses the update (ERR_SHARE_REVIEW_CHANGED).
    submitted_at: datetime | None = None
    replied_at: datetime | None = None


class ResultShareCreate(BaseModel):
    id: uuid.UUID
    student_key: str = Field(pattern=_HEX64)
    lookup_hash: str = Field(pattern=_HEX64)
    factor: ShareFactor
    kdf_salt_b64: str | None = None
    iv_b64: str
    ciphertext_b64: str
    expiry_days: int
    # Content key and token wrapped for the teacher's account (issue #226); without it the share cannot be updated.
    wrapped_key_b64: str | None = None
    # Objections accepted until then, never after the link expires; null = off.
    review_until: datetime | None = None
    # Sending again to the student's own link (same id): keep its expiry instead of counting expiry_days from now (issue #310).
    keep_expiry: bool = False
    # Sending again to the student's own link with a new content key: its thread sealed under that key.
    review: ReviewReseal | None = None


class ResultShareOut(BaseModel):
    id: uuid.UUID
    student_key: str
    factor: ShareFactor
    size: int
    created_at: datetime
    expires_at: datetime
    # Review state (issue #226): shares made before it are not updatable.
    updatable: bool = False
    # Only the owning teacher's list carries it: the key wrapped for their account, to update shares and read objections.
    wrapped_key_b64: str | None = None
    content_updated_at: datetime | None = None
    review_until: datetime | None = None
    review_submitted_at: datetime | None = None
    review_opened_at: datetime | None = None
    review_replied_at: datetime | None = None
    review_reply_complete: bool | None = None


class SealedPayload(BaseModel):
    """A re-sealed PDF or a sealed reply: the server only stores it."""

    iv_b64: str
    ciphertext_b64: str


class ReviewReply(SealedPayload):
    """The teacher's sealed reply; *complete* says whether it answers every objected exercise (issue #280)."""

    complete: bool = True


class ResultShareOpen(BaseModel):
    # base64 of the 32-byte lookup secret the link derives.
    lookup_b64: str = Field(min_length=40, max_length=48)


class ReviewSubmit(BaseModel):
    """A student's objection (issue #226), sealed under a key only the link yields."""

    lookup_b64: str = Field(min_length=40, max_length=48)
    iv_b64: str
    ciphertext_b64: str


class ReviewOut(BaseModel):
    """The thread as the student's page sees it."""

    objection_iv_b64: str | None
    objection_ct_b64: str | None
    submitted_at: datetime | None
    opened_at: datetime | None
    reply_iv_b64: str | None
    reply_ct_b64: str | None
    replied_at: datetime | None
    reply_complete: bool | None = None


class ReviewListItem(ReviewOut):
    """One review in the teacher's list; the student appears only as the pseudonym."""

    share_id: uuid.UUID
    student_key: str


class ResultShareContent(BaseModel):
    factor: ShareFactor
    kdf_salt_b64: str | None
    iv_b64: str
    ciphertext_b64: str
    expires_at: datetime
    content_updated_at: datetime | None = None
    review_until: datetime | None = None
    review: ReviewOut | None = None


DeliveryChannel = Literal["email", "artemis"]
DeliveryStatus = Literal["sent", "failed", "bounced", "delayed"]


class ResultDeliveryOut(BaseModel):
    """One student's delivery status (issue #221); no address, only the pseudonym."""

    student_key: str
    channel: DeliveryChannel
    status: DeliveryStatus
    detail: str | None
    updated_at: datetime
    watch_until: datetime
