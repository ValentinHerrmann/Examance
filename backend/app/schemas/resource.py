"""Pydantic models for exercise resource files.

SECURITY: file content is never included in a repr. Only names and sizes are
safe to log — an uploaded file may hold anything the teacher had on disk.
"""
from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator

from app.services.latex_resources import (
    MAX_RESOURCE_BYTES,
    ResourceError,
    validate_resource_name,
)


class ExerciseResourceCreate(BaseModel):
    filename: str
    mime_type: str = "application/octet-stream"
    content_b64: str

    @field_validator("filename")
    @classmethod
    def check_filename(cls, v: str) -> str:
        try:
            return validate_resource_name(v)
        except ResourceError as exc:
            raise ValueError(str(exc)) from None

    @field_validator("mime_type")
    @classmethod
    def check_mime_type(cls, v: str) -> str:
        v = (v or "").strip() or "application/octet-stream"
        if len(v) > 150 or any(c in v for c in "\r\n"):
            raise ValueError("Invalid MIME type.")
        return v

    @field_validator("content_b64")
    @classmethod
    def check_content_size(cls, v: str) -> str:
        # Cheap pre-check on the encoded length; the exact size is enforced
        # after decoding in the router.
        if len(v) > (MAX_RESOURCE_BYTES * 4 // 3) + 1024:
            raise ValueError(
                f"Resource exceeds the {MAX_RESOURCE_BYTES // (1024 * 1024)} MB per-file limit."
            )
        return v

    def __repr__(self) -> str:
        return f"ExerciseResourceCreate(filename={self.filename!r}, <redacted>)"

    def __str__(self) -> str:
        return self.__repr__()


class ExerciseResourceRename(BaseModel):
    filename: str

    @field_validator("filename")
    @classmethod
    def check_filename(cls, v: str) -> str:
        try:
            return validate_resource_name(v)
        except ResourceError as exc:
            raise ValueError(str(exc)) from None


class ExerciseResourceResponse(BaseModel):
    """Metadata only — the bytes are fetched from the download endpoint."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    exercise_id: UUID
    filename: str
    mime_type: str
    byte_size: int
    created_at: datetime
