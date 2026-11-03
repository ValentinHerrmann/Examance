"""What an account may use (issue #53), decided only here. Admin switches: `allow_server_results` (all-server), `allow_server_latex`, `allow_exercise_sharing` (issue #65), `allow_result_delivery` (issue #209). The frontend renders from `capabilities_for`; endpoints enforce it."""
from __future__ import annotations

from dataclasses import dataclass, field

from fastapi import Depends, HTTPException, status

from app.config import settings
from app.dependencies import get_teaching_teacher
from app.models.teacher import STORAGE_MODES, Teacher
from app.services import email as email_svc

# The switches an admin can set per account, by their API name. Order is display order.
ACCOUNT_FEATURES = ("server_results", "server_latex", "exercise_sharing", "result_delivery")


@dataclass(frozen=True)
class Capabilities:
    allowed_storage_modes: tuple[str, ...]
    features: dict[str, bool] = field(default_factory=dict)


def mail_configured() -> bool:
    """Whether this server can send result mails (an SMTP host, or dev, which logs them)."""
    return bool(settings.SMTP_HOST) or settings.is_dev


def result_mailbox_configured() -> bool:
    """Whether the result mailbox is set up: result mails are sent from it and its bounces are watched (issue #221)."""
    return email_svc.result_sender() is not None


def account_features(teacher: Teacher) -> dict[str, bool]:
    """The admin-set switches of *teacher*, keyed as in `ACCOUNT_FEATURES`."""
    return {
        "server_results": teacher.allow_server_results,
        "server_latex": teacher.allow_server_latex,
        "exercise_sharing": teacher.allow_exercise_sharing,
        "result_delivery": teacher.allow_result_delivery,
    }


def capabilities_for(teacher: Teacher) -> Capabilities:
    """Storage modes and features `teacher` may use; none for an admin account (issue #58)."""
    if teacher.role != "teacher":
        return Capabilities(
            allowed_storage_modes=(),
            features=dict.fromkeys(
                (*ACCOUNT_FEATURES, "training_donation", "result_mail", "result_bounces"), False
            ),
        )
    return Capabilities(
        allowed_storage_modes=(
            STORAGE_MODES if teacher.allow_server_results else ("hybrid",)
        ),
        features={
            **account_features(teacher),
            "training_donation": settings.TRAINING_DONATION_ENABLED,
            "result_mail": teacher.allow_result_delivery and mail_configured(),
            # Whether the share dialog waits for bounces after an e-mail run (issue #221).
            "result_bounces": teacher.allow_result_delivery
            and mail_configured()
            and result_mailbox_configured(),
        },
    )


def _not_allowed(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=detail,
        headers={"code": "ERR_FEATURE_NOT_ALLOWED"},
    )


async def require_server_latex(teacher: Teacher = Depends(get_teaching_teacher)) -> Teacher:
    """The signed-in teacher, if their account may compile LaTeX on the server."""
    if not capabilities_for(teacher).features.get("server_latex"):
        raise _not_allowed("Server-side LaTeX compilation is not enabled for this account.")
    return teacher


def ensure_exercise_sharing(teacher: Teacher) -> None:
    """403 unless the account may share, browse, copy and resync exercises."""
    if not teacher.allow_exercise_sharing:
        raise _not_allowed("Exercise sharing is not enabled for this account.")


async def require_exercise_sharing(teacher: Teacher = Depends(get_teaching_teacher)) -> Teacher:
    """The signed-in teacher, if their account may share, browse, copy and resync exercises."""
    ensure_exercise_sharing(teacher)
    return teacher


def require_result_delivery(teacher: Teacher = Depends(get_teaching_teacher)) -> Teacher:
    """The signed-in teacher, if their account may send graded results to students (Artemis, e-mail)."""
    if not teacher.allow_result_delivery:
        raise _not_allowed("Result delivery is not enabled for this account.")
    return teacher


async def require_server_results_writable(
    teacher: Teacher = Depends(get_teaching_teacher),
) -> Teacher:
    """The signed-in teacher, if their account may write grading results to the server. A revoked account still in "all-server" keeps writing until resultsMover.ts moved its results out (else they strand offline). Reads and deletes are never gated (move, erasure need them)."""
    if "all-server" in capabilities_for(teacher).allowed_storage_modes:
        return teacher
    if teacher.storage_mode == "all-server":
        return teacher
    raise _not_allowed("Storing grading results on the server is not enabled for this account.")
