"""Schemas for the account's layout templates (/user/layout-templates; issue #279)."""
from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

LayoutTemplateId = Literal["examanceBooklet", "examanceAnonymous", "paperAnonymous", "paperClassic"]

# The stored settings of one template; generous for the info text and notes, small against abuse.
MAX_FIELDS_BYTES = 16_000


class LayoutTemplate(BaseModel):
    """One edited slot; keys of ``fields`` are not listed, so a new Layout-page setting needs no backend change."""

    model_config = ConfigDict(extra="forbid")

    id: LayoutTemplateId
    title: str | None = Field(default=None, max_length=80)
    text: str | None = Field(default=None, max_length=200)
    fields: dict[str, Any] | None = None

    @field_validator("title", "text", mode="before")
    @classmethod
    def blank_is_none(cls, value: Any) -> Any:
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value

    @field_validator("fields")
    @classmethod
    def small_fields(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is not None and len(json.dumps(value)) > MAX_FIELDS_BYTES:
            raise ValueError("Layout template settings are too large.")
        return value


class LayoutTemplates(BaseModel):
    """The slots the account changed; a slot not listed is the built-in default."""

    model_config = ConfigDict(extra="forbid")

    templates: list[LayoutTemplate] = Field(default_factory=list, max_length=4)

    @field_validator("templates")
    @classmethod
    def unique_ids(cls, value: list[LayoutTemplate]) -> list[LayoutTemplate]:
        if len({t.id for t in value}) != len(value):
            raise ValueError("A layout template is listed twice.")
        return value
