"""
Key-envelope maintenance the server is allowed to perform.

The server can never *re-wrap* anything — that needs the new password, which it
sees only as an Argon2id hash, and the data key, which it never sees at all. But
it can mark a wrap stale, and it must, whenever a password is set outside the
browser flow that would have re-wrapped alongside it.

Without this the `password` wrap would still be keyed to a password nobody knows.
The client would derive a key-encryption key that does not open it, and the
teacher would land in a vault of blank fields rather than being told to recover
with their recovery code — which is exactly the failure this whole change exists
to remove.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.key_envelope import KeyEnvelope


async def invalidate_password_wrap(db: AsyncSession, teacher_id: uuid.UUID) -> None:
    """
    Mark the teacher's password wrap unusable after a server-side password write.

    The recovery and passkey wraps are left alone: they still hold the same data
    key, and they are how the teacher gets back in.
    """
    await db.execute(
        update(KeyEnvelope)
        .where(
            KeyEnvelope.teacher_id == teacher_id,
            KeyEnvelope.kind == "password",
            KeyEnvelope.invalidated_at.is_(None),
        )
        .values(invalidated_at=datetime.now(tz=UTC))
    )
