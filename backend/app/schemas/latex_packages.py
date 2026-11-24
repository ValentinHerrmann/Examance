"""Schemas for LaTeX package entries (/user/latex-packages; issue #108)."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.services.latex_packages import (
    MAX_ENTRIES,
    PackageEntry,
    PackageKind,
    entries_error,
    entry_error,
)


class LatexPackageEntry(BaseModel):
    """A package, TikZ or pgfplots library; unknown keys (the retired ``disabled``) are ignored."""

    model_config = ConfigDict(extra="ignore")

    kind: PackageKind = "package"
    name: str = Field(max_length=64)
    options: str = Field(default="", max_length=300)

    @field_validator("name", "options", mode="before")
    @classmethod
    def strip(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def check(self) -> LatexPackageEntry:
        error = entry_error(self.kind, self.name, self.options)
        if error:
            raise ValueError(f"Invalid LaTeX package entry ({error}): {self.name}")
        return self

    def to_entry(self) -> PackageEntry:
        return PackageEntry(self.kind, self.name, self.options)


def check_entry_list(entries: list[LatexPackageEntry] | None) -> list[LatexPackageEntry] | None:
    """Field validator for a whole level: no package twice, at most MAX_ENTRIES."""
    if entries is not None:
        error = entries_error([entry.to_entry() for entry in entries])
        if error:
            raise ValueError(f"Invalid LaTeX package list ({error}).")
    return entries


class AccountLatexPackages(BaseModel):
    """The packages added to every document of the account."""

    model_config = ConfigDict(extra="forbid")

    entries: list[LatexPackageEntry] = Field(default_factory=list, max_length=MAX_ENTRIES)
    # Load every subject package in every document; on a PUT, null leaves the choice as it is.
    all_subject_packages: bool | None = None

    _check_entries = field_validator("entries")(check_entry_list)


class TemplatePackage(BaseModel):
    name: str
    options: str
    # The template file that loads it (``packages`` is the main list).
    source: str
    # Why its options are fixed (``layout``, ``omr``), else null.
    locked: str | None = None
    # Loaded only when the document uses it (or the account loads every subject package).
    lazy: bool = False


class TemplateLibrary(BaseModel):
    name: str
    source: str


class TemplatePackages(BaseModel):
    """What the exam template loads by itself, for the settings overview."""

    packages: list[TemplatePackage]
    tikz_libraries: list[TemplateLibrary]
