"""Pydantic schemas for Exam & Exercise endpoints."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING, Any, Literal, Self

from pydantic import BaseModel, Field, field_validator, model_validator

from app.config import settings
from app.schemas.latex_packages import LatexPackageEntry, check_entry_list

if TYPE_CHECKING:
    from app.models.exercise import Exercise


def validate_retention_until(value: date | None) -> date | None:
    """Keep the retention date inside the configured window. The upper bound enforces Art. 5(1)(e) (nothing kept indefinitely); the lower bound is off by default (RETENTION_MIN_DAYS = 0) so drafts can be deleted at once, see config.py."""
    if value is None:
        return None
    today = date.today()
    earliest = today + timedelta(days=settings.RETENTION_MIN_DAYS)
    latest = today + timedelta(days=settings.RETENTION_MAX_DAYS)
    if value < earliest:
        raise ValueError(
            f"retention_until must be at least {settings.RETENTION_MIN_DAYS} days out "
            f"(earliest allowed: {earliest.isoformat()})."
        )
    if value > latest:
        raise ValueError(
            f"retention_until must be at most {settings.RETENTION_MAX_DAYS} days out "
            f"(latest allowed: {latest.isoformat()})."
        )
    return value


def normalize_topic(value: Any) -> Any:
    """Trim the optional exam topic; blank means none. Runs before max_length (padding is free)."""
    return (value.strip() or None) if isinstance(value, str) else value


class ExtraNotes(BaseModel):
    """Karo block at the end of the exam; heights in cm, the layout fills the page within them."""

    title: str = Field(max_length=200)
    description: str = Field(default="", max_length=500)
    min_height_cm: float = Field(ge=1, le=25)
    max_height_cm: float = Field(ge=1, le=25)

    @model_validator(mode="after")
    def _ordered(self) -> Self:
        if self.min_height_cm > self.max_height_cm:
            raise ValueError("min_height_cm must not exceed max_height_cm.")
        return self


_MAX_PAGE_BREAKS = 500
_MAX_ITEM_ID_LEN = 64


def check_page_breaks(value: list[str] | None) -> list[str] | None:
    """Bound the break list; entries are exercise/MC-group ids and may refer to nothing yet."""
    if value is None:
        return None
    if len(value) > _MAX_PAGE_BREAKS:
        raise ValueError(f"at most {_MAX_PAGE_BREAKS} page breaks are allowed.")
    for item in value:
        if not item or len(item) > _MAX_ITEM_ID_LEN:
            raise ValueError(f"page break ids must be 1 to {_MAX_ITEM_ID_LEN} characters.")
    return list(dict.fromkeys(value))


# Request bounds mirror the model columns (String(n), the question_type enum), so an oversized value is a 422 instead of a database error. Positions are small ints, far below int4.
QuestionType = Literal["free_text", "mc", "sc", "tf"]
# 1 = SHA-256 of the raw pseudonym, 2 = keyed per-exam HMAC (issue #177).
PseudonymVersion = Literal[1, 2]
_MAX_POSITION = 10_000


class ExerciseCreate(BaseModel):
    id: uuid.UUID | None = None
    name: str = Field(default="Exercise", max_length=200)
    topic_tag: str | None = Field(default=None, max_length=200)
    grade: str | None = Field(default=None, max_length=50)
    subject: str | None = Field(default=None, max_length=100)
    # None: the exercise's code was withheld (an exam imported from a results-only archive). The row keeps its name, points and answer key so scans and scores stay gradeable, but nothing can be compiled.
    latex_body: str | None = ""
    code_withheld: bool = False
    max_points: float = 0.0
    order_index: int = Field(default=1, ge=0, le=_MAX_POSITION)
    question_type: QuestionType = "free_text"
    correct_answers: dict[str, Any] | None = None
    penalty: float = 0.0
    exercise_group_id: uuid.UUID | None = None
    variant_key: str | None = Field(default=None, max_length=100)
    mc_group_id: uuid.UUID | None = None
    sub_index: int | None = Field(default=None, ge=0, le=_MAX_POSITION)


class ExerciseUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    topic_tag: str | None = Field(default=None, max_length=200)
    grade: str | None = Field(default=None, max_length=50)
    subject: str | None = Field(default=None, max_length=100)
    latex_body: str | None = None
    max_points: float | None = None
    exercise_group_id: uuid.UUID | None = None
    variant_key: str | None = Field(default=None, max_length=100)
    question_type: QuestionType | None = None
    correct_answers: dict[str, Any] | None = None
    penalty: float | None = None


class ExerciseGroupUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    topic_tag: str | None = Field(default=None, max_length=200)
    grade: str | None = Field(default=None, max_length=50)
    subject: str | None = Field(default=None, max_length=100)


class ExerciseGroupResponse(BaseModel):
    id: uuid.UUID
    teacher_id: uuid.UUID
    name: str
    topic_tag: str | None = None
    grade: str | None = None
    subject: str | None = None
    created_at: datetime
    # The shared group this one was copied from; resync compares against it (issue #65).
    source_group_id: uuid.UUID | None = None


class ExerciseResponse(BaseModel):
    id: uuid.UUID
    teacher_id: uuid.UUID | None = None
    name: str | None = None
    topic_tag: str | None = None
    grade: str | None = None
    subject: str | None = None
    latex_body: str | None = None
    code_withheld: bool = False
    max_points: float = 0.0
    version: int = 1
    exercise_group_id: uuid.UUID | None = None
    variant_key: str | None = None
    is_current: bool = True
    order_index: int = 1
    question_type: str = "free_text"
    correct_answers: dict[str, Any] | None = None
    penalty: float = 0.0
    mc_group_id: uuid.UUID | None = None
    sub_index: int | None = None
    # Sharing (issue #65); only filled for the caller's own rows.
    is_shared: bool = False
    shared_at: datetime | None = None
    copied_from_exercise_id: uuid.UUID | None = None
    # The row's group was copied from another account: it can be proposed back, not shared.
    group_copied: bool = False

    @classmethod
    def from_exercise(cls, ex: Exercise, **computed: Any) -> Self:
        """The library view of *ex*; *computed* sets what is no column (exam position, flags)."""
        return cls.model_validate(ex, from_attributes=True).model_copy(
            update={"is_shared": ex.is_public, **computed}
        )


class ExamMcGroupCreate(BaseModel):
    id: uuid.UUID | None = None
    title: str = Field(default="Grundlagen", max_length=200)
    scoring_text: str = (
        "Für jedes korrekte Kreuz 1BE; für jedes falsche Kreuz -0,5BE. "
        "Pro Teilaufgabe aber immer $\\geq$0BE"
    )
    order_index: int = Field(default=1, ge=0, le=_MAX_POSITION)


class ExamMcGroupResponse(BaseModel):
    id: uuid.UUID
    exam_id: uuid.UUID
    title: str
    scoring_text: str
    order_index: int
    member_ids: list[uuid.UUID] = []


class ExerciseLinkCreate(BaseModel):
    """Links an existing library exercise to an exam, with optional MC group membership."""
    exercise_id: uuid.UUID
    order_index: int = Field(default=1, ge=0, le=_MAX_POSITION)
    mc_group_id: uuid.UUID | None = None
    sub_index: int | None = Field(default=None, ge=0, le=_MAX_POSITION)


class ExamCreate(BaseModel):
    id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=500)
    latex_template: str = ""
    retention_until: date
    testart: str | None = Field(default=None, max_length=100)
    grade: str | None = Field(default=None, max_length=50)
    klasse: str | None = Field(default=None, max_length=50)
    datum: str | None = Field(default=None, max_length=100)
    nr: str | None = Field(default=None, max_length=10)
    fach: str | None = Field(default=None, max_length=100)
    topic: str | None = Field(default=None, max_length=200)
    lehrernachname: str | None = Field(default=None, max_length=100)
    info_text: str | None = None
    grading_key: dict[str, Any] | None = None
    # Package entries on top of the account's (issue #108); null follows the account.
    latex_packages: list[LatexPackageEntry] | None = None
    page_breaks: list[str] | None = None
    name_line: bool = False
    mc_correction_hint: bool = False
    extra_notes: ExtraNotes | None = None
    # 2 = keyed per-exam pseudonym HMAC (issue #177); older clients omit it and write SHA-256 values.
    pseudonym_version: PseudonymVersion = 1
    exercise_ids: list[uuid.UUID] = []
    exercise_links: list[ExerciseLinkCreate] = []
    exercises: list[ExerciseCreate] = []
    mc_groups: list[ExamMcGroupCreate] = []

    _check_retention = field_validator("retention_until")(validate_retention_until)
    _normalize_topic = field_validator("topic", mode="before")(normalize_topic)
    _check_packages = field_validator("latex_packages")(check_entry_list)
    _check_page_breaks = field_validator("page_breaks")(check_page_breaks)


class ExamDuplicate(BaseModel):
    """A duplicate gets its own retention window, like a new exam (issue #121)."""

    retention_until: date
    # Like ExamCreate: older clients omit it.
    pseudonym_version: PseudonymVersion = 1

    _check_retention = field_validator("retention_until")(validate_retention_until)


class ExamUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=500)
    latex_template: str | None = None
    retention_until: date | None = None
    testart: str | None = Field(default=None, max_length=100)
    grade: str | None = Field(default=None, max_length=50)
    klasse: str | None = Field(default=None, max_length=50)
    datum: str | None = Field(default=None, max_length=100)
    nr: str | None = Field(default=None, max_length=10)
    fach: str | None = Field(default=None, max_length=100)
    # Absent keeps the stored topic; null or blank clears it (checked via model_fields_set).
    topic: str | None = Field(default=None, max_length=200)
    lehrernachname: str | None = Field(default=None, max_length=100)
    info_text: str | None = None
    grading_key: dict[str, Any] | None = None
    # Absent keeps the stored override; null clears it, so the exam follows the account again.
    latex_packages: list[LatexPackageEntry] | None = None
    # Absent keeps the stored breaks; null or [] clears them.
    page_breaks: list[str] | None = None
    name_line: bool | None = None
    mc_correction_hint: bool | None = None
    # Absent keeps the stored block; null switches it off.
    extra_notes: ExtraNotes | None = None
    exercise_ids: list[uuid.UUID] | None = None
    exercise_links: list[ExerciseLinkCreate] | None = None
    mc_groups: list[ExamMcGroupCreate] | None = None

    _check_retention = field_validator("retention_until")(validate_retention_until)
    _normalize_topic = field_validator("topic", mode="before")(normalize_topic)
    _check_packages = field_validator("latex_packages")(check_entry_list)
    _check_page_breaks = field_validator("page_breaks")(check_page_breaks)


class ExamResponse(BaseModel):
    id: uuid.UUID
    teacher_id: uuid.UUID
    title: str
    latex_template: str
    compilation_status: str
    created_at: datetime
    retention_until: date
    testart: str | None = None
    grade: str | None = None
    klasse: str | None = None
    datum: str | None = None
    nr: str | None = None
    fach: str | None = None
    topic: str | None = None
    lehrernachname: str | None = None
    info_text: str | None = None
    grading_key: dict[str, Any] | None = None
    latex_packages: list[LatexPackageEntry] | None = None
    page_breaks: list[str] | None = None
    name_line: bool = False
    mc_correction_hint: bool = False
    extra_notes: ExtraNotes | None = None
    pseudonym_version: int = 1
    exercises: list[ExerciseResponse] = []
    mc_groups: list[ExamMcGroupResponse] = []


class ExamUsageItem(BaseModel):
    id: uuid.UUID
    title: str
    datum: str | None = None


class ExerciseUsageResponse(BaseModel):
    exam_count: int
    exams: list[ExamUsageItem] = []



_HMAC_PATTERN = r"^[0-9a-f]{64}$"


class PseudonymList(BaseModel):
    """Every pseudonym value an exam holds, live and soft-deleted, for a client-side rekey (issue #177)."""

    pseudonym_version: int
    values: list[str]


class PseudonymPair(BaseModel):
    old: str = Field(min_length=64, max_length=64)
    new: str = Field(pattern=_HMAC_PATTERN)


class PseudonymRekey(BaseModel):
    """Renames an exam's pseudonyms from one version to the next; `pairs` must cover every value the exam holds."""

    from_version: PseudonymVersion
    to_version: PseudonymVersion
    pairs: list[PseudonymPair] = Field(max_length=100_000)


class PseudonymRekeyResult(BaseModel):
    #: False when the exam already was at `to_version` (a repeat, or another browser did it).
    changed: bool
    pseudonym_version: int
    renamed: int
