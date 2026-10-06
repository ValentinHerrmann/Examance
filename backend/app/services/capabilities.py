"""What an account may use (issue #53): storage modes and server features; decided only here.

Admin switches per account: `allow_server_results` ("all-server" mode; "hybrid" is always allowed),
`allow_server_latex` and `allow_exercise_sharing` (issue #65). The frontend renders from
`capabilities_for`; endpoints enforce it."""
from __future__ import annotations

from dataclasses import dataclass, field

from fastapi import Depends, HTTPException, status

from app.config import settings
from app.dependencies import get_current_teacher
from app.models.teacher import STORAGE_MODES, Teacher

# The switches an admin can set per account, by their API name. Order is display order.
ACCOUNT_FEATURES = ("server_results", "server_latex", "exercise_sharing")


@dataclass(frozen=True)
class Capabilities:
    allowed_storage_modes: tuple[str, ...]
    features: dict[str, bool] = field(default_factory=dict)


def account_features(teacher: Teacher) -> dict[str, bool]:
    """The admin-set switches of *teacher*, keyed as in `ACCOUNT_FEATURES`."""
    return {
        "server_results": teacher.allow_server_results,
        "server_latex": teacher.allow_server_latex,
        "exercise_sharing": teacher.allow_exercise_sharing,
    }


def capabilities_for(teacher: Teacher) -> Capabilities:
    """Storage modes and features `teacher` may use."""
    return Capabilities(
        allowed_storage_modes=(
            STORAGE_MODES if teacher.allow_server_results else ("hybrid",)
        ),
        features={
            **account_features(teacher),
            "training_donation": settings.TRAINING_DONATION_ENABLED,
        },
    )


def _not_allowed(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=detail,
        headers={"code": "ERR_FEATURE_NOT_ALLOWED"},
    )


async def require_server_latex(teacher: Teacher = Depends(get_current_teacher)) -> Teacher:
    """The signed-in teacher, if their account may compile LaTeX on the server."""
    if not capabilities_for(teacher).features.get("server_latex"):
        raise _not_allowed("Server-side LaTeX compilation is not enabled for this account.")
    return teacher


async def require_exercise_sharing(teacher: Teacher = Depends(get_current_teacher)) -> Teacher:
    """The signed-in teacher, if their account may share, browse, copy and resync exercises."""
    if not teacher.allow_exercise_sharing:
        raise _not_allowed("Exercise sharing is not enabled for this account.")
    return teacher


async def require_server_results_writable(
    teacher: Teacher = Depends(get_current_teacher),
) -> Teacher:
    """The signed-in teacher, if their account may write grading results to the server.

    A revoked account still in "all-server" keeps writing until resultsMover.ts moved its results
    out (else they strand offline). Reads and deletes are never gated (move, erasure need them)."""
    if "all-server" in capabilities_for(teacher).allowed_storage_modes:
        return teacher
    if teacher.storage_mode == "all-server":
        return teacher
    raise _not_allowed("Storing grading results on the server is not enabled for this account.")
