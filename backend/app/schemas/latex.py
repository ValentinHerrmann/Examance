"""Pydantic model for LaTeX compilation requests.

SECURITY: __repr__ is overridden to prevent LaTeX source from appearing in:
  - Exception tracebacks
  - Framework debug logging
  - APM / Sentry error reports
  - Any log at any level in any environment

There is no env-var toggle for this. The redaction is unconditional. The same
applies to attached resource files: only their names may ever be logged.
"""
from __future__ import annotations

import base64
import binascii

from pydantic import BaseModel, Field, field_validator

from app.services.latex_resources import (
    MAX_COMPILE_RESOURCE_BYTES,
    MAX_COMPILE_RESOURCE_COUNT,
    MAX_RESOURCE_BYTES,
    ResourceError,
    validate_resource_name,
)


class LaTeXResource(BaseModel):
    """One file to place next to main.tex for this compilation only.

    Nothing here is persisted: the bytes live in the temp working directory and
    are removed with it. Teachers in all-local mode keep the only durable copy.
    """

    filename: str
    content_b64: str

    @field_validator("filename")
    @classmethod
    def check_filename(cls, v: str) -> str:
        try:
            return validate_resource_name(v)
        except ResourceError as exc:
            raise ValueError(str(exc)) from None

    @field_validator("content_b64")
    @classmethod
    def check_content(cls, v: str) -> str:
        try:
            decoded = base64.b64decode(v, validate=True)
        except (binascii.Error, ValueError):
            raise ValueError("Resource content is not valid base64.") from None
        if not decoded:
            raise ValueError("Resource content must not be empty.")
        if len(decoded) > MAX_RESOURCE_BYTES:
            raise ValueError(
                f"Resource exceeds the {MAX_RESOURCE_BYTES // (1024 * 1024)} MB per-file limit."
            )
        return v

    @property
    def content(self) -> bytes:
        return base64.b64decode(self.content_b64, validate=True)

    def __repr__(self) -> str:
        # Intentionally does NOT include the file content.
        return f"LaTeXResource(filename={self.filename!r}, <redacted>)"

    def __str__(self) -> str:
        return self.__repr__()


class LaTeXRequest(BaseModel):
    latex: str
    resources: list[LaTeXResource] = Field(default_factory=list)

    @field_validator("latex")
    @classmethod
    def check_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("LaTeX source must not be empty.")
        return v

    @field_validator("resources")
    @classmethod
    def check_resources(cls, v: list[LaTeXResource]) -> list[LaTeXResource]:
        if len(v) > MAX_COMPILE_RESOURCE_COUNT:
            raise ValueError(
                f"At most {MAX_COMPILE_RESOURCE_COUNT} resource files per compilation."
            )
        total = sum(len(r.content) for r in v)
        if total > MAX_COMPILE_RESOURCE_BYTES:
            raise ValueError(
                "Resource files exceed the "
                f"{MAX_COMPILE_RESOURCE_BYTES // (1024 * 1024)} MB total limit per compilation."
            )
        names = [r.filename for r in v]
        if len(set(names)) != len(names):
            raise ValueError("Resource file names must be unique within one compilation.")
        return v

    def binary_files(self) -> dict[str, bytes]:
        """Decoded resources keyed by the flat name they get in the working dir."""
        return {r.filename: r.content for r in self.resources}

    def __repr__(self) -> str:
        # Intentionally does NOT include the latex field value or file content.
        return "LaTeXRequest(<redacted>)"

    def __str__(self) -> str:
        return self.__repr__()
