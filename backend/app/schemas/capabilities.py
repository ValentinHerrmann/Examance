"""Schemas for /user/capabilities and /user/storage-mode."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

StorageMode = Literal["all-server", "hybrid"]


class CapabilitiesOut(BaseModel):
    storage_mode: StorageMode | None
    allowed_storage_modes: list[StorageMode]
    features: dict[str, bool]


class StorageModeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: StorageMode
    # The mode the client believes is current (null for the first choice). A mismatch answers
    # 409, so two browsers changing the mode at once cannot overwrite each other unnoticed.
    expected: StorageMode | None
