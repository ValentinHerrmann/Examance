"""Schemas for exam header logos (/user/logo, /exams/{id}/logo).

SECURITY: the logo's bytes are never part of a repr; only type and size may be logged.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.services.logo import MAX_LOGO_BYTES, LogoSource

AccountLogoMode = Literal["default", "none", "custom"]
ExamLogoMode = Literal["account", "none", "custom"]


def _check_encoded_size(v: str) -> str:
    # Cheap pre-check on the encoded length; the decoded size is checked by decode_logo().
    if len(v) > (MAX_LOGO_BYTES * 4 // 3) + 1024:
        raise ValueError(f"The logo exceeds the {MAX_LOGO_BYTES // (1024 * 1024)} MB limit.")
    return v


class AccountLogoUpdate(BaseModel):
    """
    The account's logo choice: ``default`` prints the bundled default logo (MTG), ``none`` prints
    no logo, ``custom`` prints ``content_b64``. ``custom`` without content keeps the stored file.
    The type is read from the bytes, never from the client.
    """

    model_config = ConfigDict(extra="forbid")

    mode: AccountLogoMode
    content_b64: str | None = None

    @field_validator("content_b64")
    @classmethod
    def check_size(cls, v: str | None) -> str | None:
        return None if v is None else _check_encoded_size(v)

    @model_validator(mode="after")
    def content_only_for_custom(self) -> AccountLogoUpdate:
        if self.content_b64 is not None and self.mode != "custom":
            raise ValueError("Only a custom logo carries a file.")
        return self

    def __repr__(self) -> str:
        return f"AccountLogoUpdate(mode={self.mode!r}, <redacted>)"

    def __str__(self) -> str:
        return self.__repr__()


class ExamLogoUpdate(BaseModel):
    """
    An exam's logo choice: ``account`` follows the account logo, ``none`` prints no logo,
    ``custom`` prints ``content_b64``. ``custom`` without content keeps the exam's stored file.
    """

    model_config = ConfigDict(extra="forbid")

    mode: ExamLogoMode
    content_b64: str | None = None

    @field_validator("content_b64")
    @classmethod
    def check_size(cls, v: str | None) -> str | None:
        return None if v is None else _check_encoded_size(v)

    @model_validator(mode="after")
    def content_only_for_custom(self) -> ExamLogoUpdate:
        if self.content_b64 is not None and self.mode != "custom":
            raise ValueError("Only a custom logo carries a file.")
        return self

    def __repr__(self) -> str:
        return f"ExamLogoUpdate(mode={self.mode!r}, <redacted>)"

    def __str__(self) -> str:
        return self.__repr__()


class LogoInfo(BaseModel):
    """Metadata of a logo; the bytes come from the matching ``/file`` endpoint."""

    #: Where the printed logo comes from.
    source: LogoSource
    mime_type: str | None = None
    byte_size: int = 0
    updated_at: datetime | None = None


class AccountLogoInfo(LogoInfo):
    #: The account's own setting; ``source`` is what that resolves to.
    mode: AccountLogoMode


class ExamLogoInfo(LogoInfo):
    #: The exam's own setting; ``source`` is what that resolves to.
    mode: ExamLogoMode
