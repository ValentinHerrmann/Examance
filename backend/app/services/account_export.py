"""GDPR Art. 15/20 export: the machine-readable copy of what the server holds about a teacher.

Only the account holder's own data: account fields, authored exams, audit trail. Student payloads
are excluded (the server cannot read them); the client-side export covers them."""
from __future__ import annotations

import base64
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.exam import Exam
from app.models.exercise import Exercise
from app.models.exercise_contribution import ExerciseContribution
from app.models.logo import ExamLogo
from app.models.teacher import Teacher
from app.services.capabilities import account_features
from app.services.logo import get_teacher_logo


def _iso(value: date | datetime | None) -> str | None:
    return value.isoformat() if value else None


def _logo_export(mime_type: str | None, content: bytes | None) -> dict[str, Any] | None:
    if not content:
        return None
    return {
        "mime_type": mime_type,
        "byte_size": len(content),
        "content_b64": base64.b64encode(content).decode("ascii"),
    }


def _exam_logo_export(row: ExamLogo | None) -> dict[str, Any]:
    if row is None:
        return {"mode": "account"}
    return {"mode": row.mode, "file": _logo_export(row.mime_type, row.content)}


async def build_export(teacher: Teacher, db: AsyncSession) -> dict[str, Any]:
    """Everything is read here, so the caller may add its own audit entry afterwards without
    that entry appearing in the export."""
    exams = list(
        (
            await db.execute(
                select(Exam).where(Exam.teacher_id == teacher.id).order_by(Exam.created_at.asc())
            )
        ).scalars()
    )
    logo = await get_teacher_logo(teacher.id, db)
    exam_logos = {
        row.exam_id: row
        for row in (
            await db.execute(select(ExamLogo).where(ExamLogo.exam_id.in_([e.id for e in exams])))
        ).scalars()
    }
    audit_entries = (
        await db.execute(
            select(AuditLog)
            .where(AuditLog.teacher_id == teacher.id)
            .order_by(AuditLog.created_at.asc())
        )
    ).scalars().all()
    # Shared rows disclose the account's e-mail to every other account (issue #65).
    shared = (
        await db.execute(
            select(Exercise)
            .where(Exercise.teacher_id == teacher.id, Exercise.is_public.is_(True))
            .order_by(Exercise.shared_at.asc())
        )
    ).scalars().all()
    submitted = (
        await db.execute(
            select(ExerciseContribution)
            .where(ExerciseContribution.contributor_id == teacher.id)
            .order_by(ExerciseContribution.created_at.asc())
        )
    ).scalars().all()

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "account": {
            "id": str(teacher.id),
            "email": teacher.email,
            "role": teacher.role,
            "created_at": _iso(teacher.created_at),
            "approved_at": _iso(teacher.approved_at),
            "registration_note": teacher.registration_note,
            "storage_mode": teacher.storage_mode,
            "features": account_features(teacher),
            "sharing_paused": teacher.sharing_paused,
            # The logo is printed on the exams, so the export carries the file itself.
            # "default" prints the bundled default logo, which is not the teacher's data.
            "exam_logo": (
                {"mode": "default"}
                if logo is None
                else {"mode": logo.mode, "file": _logo_export(logo.mime_type, logo.content)}
            ),
            # Packages added to every exam document (issue #108); null means none.
            "latex_packages": teacher.latex_packages,
        },
        "exams": [
            {
                "id": str(exam.id),
                "title": exam.title,
                "grade": exam.grade,
                "klasse": exam.klasse,
                "fach": exam.fach,
                "topic": exam.topic,
                "datum": exam.datum,
                "created_at": _iso(exam.created_at),
                "retention_until": _iso(exam.retention_until),
                "deleted_at": _iso(exam.deleted_at),
                # "account": prints the account's exam_logo; "none": no logo; "custom": own file.
                "logo": _exam_logo_export(exam_logos.get(exam.id)),
                # Package entries on top of the account's; null follows the account.
                "latex_packages": exam.latex_packages,
                "page_breaks": exam.page_breaks,
                "name_line": exam.name_line,
                "extra_notes": exam.extra_notes,
            }
            for exam in exams
        ],
        "shared_exercises": [
            {
                "id": str(ex.id),
                "name": ex.name,
                "version": ex.version,
                "variant_key": ex.variant_key,
                "is_current": ex.is_current,
                "shared_at": _iso(ex.shared_at),
            }
            for ex in shared
        ],
        # Proposals this account sent; content is kept only while undecided.
        "contributions_submitted": [
            {
                "id": str(c.id),
                "kind": c.kind,
                "variant_key": c.variant_key,
                "status": c.status,
                "message": c.message,
                "latex_body": c.latex_body,
                "created_at": _iso(c.created_at),
                "decided_at": _iso(c.decided_at),
            }
            for c in submitted
        ],
        "audit_log": [
            {
                "action": entry.action,
                "target_hash": entry.target_hash,
                "created_at": _iso(entry.created_at),
            }
            for entry in audit_entries
        ],
    }
