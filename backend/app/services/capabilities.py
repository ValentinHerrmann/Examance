"""What an account may use: storage modes and optional server features.

The single place that decides it. Today every account may use everything the deployment
offers; a later per-user switch (an admin enabling or disabling features for a teacher) is a
lookup added here, without changing the API or the frontend, which renders its options from
this answer.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from app.config import settings
from app.models.teacher import STORAGE_MODES, Teacher


@dataclass(frozen=True)
class Capabilities:
    allowed_storage_modes: tuple[str, ...]
    features: dict[str, bool] = field(default_factory=dict)


def capabilities_for(teacher: Teacher) -> Capabilities:
    """Storage modes and features `teacher` may use."""
    return Capabilities(
        allowed_storage_modes=STORAGE_MODES,
        features={
            "server_latex": True,
            "training_donation": settings.TRAINING_DONATION_ENABLED,
        },
    )
