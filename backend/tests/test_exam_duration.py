"""The exam's working time moved out of the date text into whole minutes (issue #265)."""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

_PATH = Path(__file__).parent.parent / "alembic" / "versions" / "0067_exam_duration_minutes.py"
_SPEC = importlib.util.spec_from_file_location("exam_duration_migration", _PATH)
assert _SPEC is not None
assert _SPEC.loader is not None
_MIGRATION = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_MIGRATION)


@pytest.mark.parametrize(
    ("datum", "expected"),
    [
        ("14.08.2026 (30 Minuten)", ("14.08.2026", 30)),
        ("14.08.2026 (30 Min)", ("14.08.2026", 30)),
        ("14.08.2026 (90 min.)", ("14.08.2026", 90)),
        ("14.08.2026 (1,5 Std)", ("14.08.2026", 90)),
        ("14.08.2026 (2 h)", ("14.08.2026", 120)),
        ("14.08.2026 (90 MINUTEN)", ("14.08.2026", 90)),
        ("14.08.2026 (2 Stunden)", ("14.08.2026", 120)),
        ("14.08.2026 (3 Tage)", ("14.08.2026 (3 Tage)", None)),
        ("(45)", ("", 45)),
        ("14.08.2026", ("14.08.2026", None)),
        # Unreadable texts stay where they are, so nothing is lost.
        ("14.08.2026 (2 Schulstunden)", ("14.08.2026 (2 Schulstunden)", None)),
        ("14.08.2026 (37,5 Min)", ("14.08.2026 (37,5 Min)", None)),
        (None, (None, None)),
    ],
)
def test_split_legacy_datum(datum: str | None, expected: tuple[str | None, int | None]) -> None:
    assert _MIGRATION.split_legacy_datum(datum) == expected
