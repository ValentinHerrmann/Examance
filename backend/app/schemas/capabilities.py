"""Schemas for /user/capabilities and /user/storage-mode."""
from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict

StorageMode = Literal["all-server", "hybrid"]


class CapabilitiesOut(BaseModel):
    # The account the answer is about. A tab compares it with its own session: cookies are shared
    # by every tab of a browser, so a sign-in elsewhere would otherwise answer for another account.
    account_id: uuid.UUID
    storage_mode: StorageMode | None
    allowed_storage_modes: list[StorageMode]
    features: dict[str, bool]
    # The teacher paused their own sharing (issue #65); shared exercises are hidden meanwhile.
    sharing_paused: bool = False


class StorageModeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: StorageMode
    # The mode the client believes is current (null for the first choice). A mismatch answers
    # 409, so two browsers changing the mode at once cannot overwrite each other unnoticed.
    expected: StorageMode | None
