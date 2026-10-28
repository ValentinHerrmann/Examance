"""Per-account feature switches shared by the user and allowed-domain endpoints."""
from __future__ import annotations

from app.models.allowed_email_domain import AllowedEmailDomain
from app.models.teacher import Teacher
from app.schemas.admin import AccountFeatures, AccountFeaturesUpdate


def features_of(row: Teacher | AllowedEmailDomain) -> AccountFeatures:
    return AccountFeatures(
        server_results=row.allow_server_results,
        server_latex=row.allow_server_latex,
        exercise_sharing=row.allow_exercise_sharing,
    )


def apply_features(row: Teacher | AllowedEmailDomain, features: AccountFeatures) -> None:
    row.allow_server_results = features.server_results
    row.allow_server_latex = features.server_latex
    row.allow_exercise_sharing = features.exercise_sharing


def patch_features(row: Teacher | AllowedEmailDomain, change: AccountFeaturesUpdate) -> None:
    """Apply the switches *change* names; omitted ones stay."""
    if change.server_results is not None:
        row.allow_server_results = change.server_results
    if change.server_latex is not None:
        row.allow_server_latex = change.server_latex
    if change.exercise_sharing is not None:
        row.allow_exercise_sharing = change.exercise_sharing
