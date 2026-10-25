"""Layout reports (issue #134)."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

MAX_REPORT_FILES = 40


class LayoutReportFileIn(BaseModel):
    filename: str = Field(min_length=1, max_length=255, pattern=r"^[^/\\\"\x00-\x1f]+$")
    mime_type: str = Field(min_length=1, max_length=150)
    content_b64: str


class LayoutReportCreate(BaseModel):
    source_kind: Literal["exam", "exercise"]
    source_title: str = Field(default="", max_length=255)
    engine: Literal["browser", "server"]
    app_version: str = Field(default="", max_length=64)
    problem: str = Field(min_length=1, max_length=2000)
    expected: str = Field(min_length=1, max_length=2000)
    compile_error: str | None = Field(default=None, max_length=20000)
    files: list[LayoutReportFileIn] = Field(default_factory=list, max_length=MAX_REPORT_FILES)


class LayoutReportFileOut(BaseModel):
    id: uuid.UUID
    filename: str
    mime_type: str
    byte_size: int


class LayoutReportSummary(BaseModel):
    id: uuid.UUID
    reporter_email: str
    source_kind: Literal["exam", "exercise"]
    source_title: str
    status: Literal["open", "done"]
    problem: str
    created_at: datetime
    resolved_at: datetime | None


class LayoutReportDetail(LayoutReportSummary):
    engine: str
    app_version: str
    expected: str
    compile_error: str | None
    resolution_note: str | None
    files: list[LayoutReportFileOut]


class LayoutReportList(BaseModel):
    items: list[LayoutReportSummary]
    total: int
    open_count: int


class LayoutReportResolve(BaseModel):
    note: str | None = Field(default=None, max_length=1000)
