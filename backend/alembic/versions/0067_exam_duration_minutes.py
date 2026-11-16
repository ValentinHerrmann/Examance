"""Working time of an exam as whole minutes, split out of the date text (issue #265)

Revision ID: 0067_exam_duration
Revises: 0066_share_reviews
Create Date: 2026-11-15
"""
from __future__ import annotations

import re

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0067_exam_duration"
down_revision = "0066_share_reviews"
branch_labels = None
depends_on = None

_BRACKET = re.compile(r"^(.*?)\s*\(([^()]*)\)\s*$")
_DURATION = re.compile(r"^(\d+(?:[.,]\d+)?)\s*([a-z.]*)$", re.IGNORECASE)
_MINUTE_UNITS = {"", "min", "min.", "minute", "minuten", "minutes"}
_HOUR_UNITS = {"std", "std.", "stunde", "stunden", "h", "hour", "hours"}


def split_legacy_datum(datum: str | None) -> tuple[str | None, int | None]:
    """The date without its bracket and the whole minutes; an unreadable bracket stays in place (mirrors `splitLegacyDatum` in examLabel.ts)."""
    match = _BRACKET.match(datum or "")
    if match is None:
        return datum, None
    duration = _DURATION.match(match.group(2).strip())
    if duration is None:
        return datum, None
    unit = duration.group(2).lower()
    if unit not in _MINUTE_UNITS and unit not in _HOUR_UNITS:
        return datum, None
    minutes = float(duration.group(1).replace(",", ".")) * (1 if unit in _MINUTE_UNITS else 60)
    if minutes < 1 or minutes > 1440 or minutes != int(minutes):
        return datum, None
    return match.group(1), int(minutes)


def upgrade() -> None:
    op.add_column("exams", sa.Column("duration_minutes", sa.Integer(), nullable=True))
    exams = sa.table("exams", sa.column("id"), sa.column("datum"), sa.column("duration_minutes"))
    bind = op.get_bind()
    for exam_id, datum in bind.execute(sa.select(exams.c.id, exams.c.datum).where(exams.c.datum.like("%(%)%"))).all():
        date_text, minutes = split_legacy_datum(datum)
        if minutes is not None:
            bind.execute(exams.update().where(exams.c.id == exam_id).values(datum=date_text, duration_minutes=minutes))


def downgrade() -> None:
    exams = sa.table("exams", sa.column("id"), sa.column("datum"), sa.column("duration_minutes"))
    bind = op.get_bind()
    rows = bind.execute(sa.select(exams.c.id, exams.c.datum, exams.c.duration_minutes).where(exams.c.duration_minutes.is_not(None))).all()
    for exam_id, datum, minutes in rows:
        bind.execute(exams.update().where(exams.c.id == exam_id).values(datum=f"{datum or ''} ({minutes} Minuten)".strip()))
    op.drop_column("exams", "duration_minutes")
