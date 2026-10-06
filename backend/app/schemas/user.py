"""Schemas for /user/* account actions."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class AccountDeletionRequestIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Keep the library exercises on the server without an owner (for future sharing).
    keep_exercises: bool = False
