"""Indexes that migrations create must also be declared on the models, or autogenerate proposes dropping them (issue #297)."""
from __future__ import annotations

from app.models.exam_exercise import ExamExercise
from app.models.exercise import Exercise


def _index_names(model: type) -> set[str]:
    return {str(i.name) for i in model.__table__.indexes}  # type: ignore[attr-defined]


def test_exam_exercises_has_its_exercise_index() -> None:
    assert "ix_exam_exercises_exercise_id" in _index_names(ExamExercise)


def test_exercises_declares_the_sharing_index() -> None:
    assert "ix_exercises_shared" in _index_names(Exercise)
