"""Proposals from a linked copy back to the shared original (issue #65).

An owner's library changes only when the owner accepts a reviewed, immutable snapshot, and then
only by adding a version or a variant; nothing an exam links is ever updated in place."""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import ColumnElement, delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exercise import Exercise
from app.models.exercise_contribution import ExerciseContribution, ExerciseContributionResource
from app.models.exercise_group import ExerciseGroup
from app.models.exercise_resource import ExerciseResource
from app.models.teacher import Teacher
from app.services import account_mail
from app.services.exercise_sharing import (
    content_fingerprint,
    edited_content,
    new_variant_row,
    next_version,
    plan_groups,
    resource_digests,
    sha256_hex,
)

MAX_PENDING_PER_CONTRIBUTOR = 20
NOTICE_QUIET_MINUTES = 15


class ContributionError(Exception):
    def __init__(self, status: int, detail: str, code: str | None = None) -> None:
        super().__init__(detail)
        self.status = status
        self.detail = detail
        self.code = code


def _not_found() -> ContributionError:
    return ContributionError(404, "Proposal not found")


def _decided() -> ContributionError:
    return ContributionError(409, "This proposal was already decided.", "ERR_CONTRIBUTION_DECIDED")


def _not_contributable() -> ContributionError:
    return ContributionError(400, "Nothing to propose for this variant.", "ERR_NOT_CONTRIBUTABLE")


def _payload(row: Exercise) -> dict[str, object]:
    return {
        "latex_body": row.latex_body,
        "question_type": row.question_type,
        "correct_answers": row.correct_answers,
        "penalty": row.penalty,
        "max_points": row.max_points,
    }


async def submit(
    contributor: Teacher,
    group_id: uuid.UUID,
    own_exercise_ids: Sequence[uuid.UUID],
    message: str | None,
    db: AsyncSession,
) -> list[ExerciseContribution]:
    """Snapshot the chosen variants of *contributor*'s linked copy as proposals to the original.
    Changed variants become version proposals, variants added to the copy variant proposals."""
    plans = await plan_groups(contributor, db, group_id)
    if not plans:
        raise ContributionError(404, "Exercise group not found")
    plan = plans[0]
    sources = [v.source for v in plan.variants if v.source is not None]
    if not sources or plan.group.source_group_id is None:
        raise ContributionError(
            404, "The original is no longer shared.", "ERR_SHARE_SOURCE_UNAVAILABLE"
        )
    owner_id = sources[0].teacher_id
    if owner_id is None:
        raise ContributionError(404, "The original is no longer shared.")
    by_own = {v.own.id: v for v in plan.variants if v.own is not None}

    picked: list[tuple[Exercise, str, uuid.UUID | None]] = []
    for own_id in dict.fromkeys(own_exercise_ids):
        variant = by_own.get(own_id)
        if variant is None or variant.own is None:
            raise _not_contributable()
        if variant.kind == "local":
            picked.append((variant.own, "variant", None))
        elif variant.source is not None and variant.locally_modified:
            picked.append((variant.own, "version", variant.source.id))
        else:
            raise _not_contributable()
    if not picked:
        raise ContributionError(400, "Choose at least one variant.", "ERR_NOT_CONTRIBUTABLE")

    source_group_id = plan.group.source_group_id
    # One pending proposal per variant: a newer one replaces (withdraws) the older.
    for own, kind, target in picked:
        same = ExerciseContribution.target_exercise_id == target
        if kind == "variant":
            same = ExerciseContribution.variant_key == own.variant_key
        await _close(
            db,
            (
                ExerciseContribution.contributor_id == contributor.id,
                ExerciseContribution.source_group_id == source_group_id,
                ExerciseContribution.kind == kind,
                same,
            ),
            "withdrawn",
        )
    pending = await db.scalar(
        select(func.count())
        .select_from(ExerciseContribution)
        .where(
            ExerciseContribution.contributor_id == contributor.id,
            ExerciseContribution.status == "pending",
        )
    ) or 0
    if pending + len(picked) > MAX_PENDING_PER_CONTRIBUTOR:
        raise ContributionError(
            429, "Too many open proposals; wait for decisions first.", "ERR_CONTRIBUTION_LIMIT"
        )

    created: list[ExerciseContribution] = []
    for own, kind, target in picked:
        row = ExerciseContribution(
            owner_id=owner_id,
            contributor_id=contributor.id,
            source_group_id=source_group_id,
            target_exercise_id=target,
            from_exercise_id=own.id,
            kind=kind,
            variant_key=own.variant_key,
            message=(message or "").strip()[:1000] or None,
            base_fingerprint=own.synced_fingerprint if kind == "version" else None,
            status="pending",
            **_payload(own),
        )
        db.add(row)
        await db.flush()
        files = (
            await db.execute(select(ExerciseResource).where(ExerciseResource.exercise_id == own.id))
        ).scalars()
        for f in files:
            db.add(
                ExerciseContributionResource(
                    contribution_id=row.id,
                    filename=f.filename,
                    mime_type=f.mime_type,
                    byte_size=f.byte_size,
                    content=f.content,
                    content_sha256=f.content_sha256 or sha256_hex(f.content),
                )
            )
        created.append(row)
    await db.flush()
    return created


async def notice_mails(
    db: AsyncSession, owner_id: uuid.UUID, new_ids: Sequence[uuid.UUID]
) -> list[account_mail.Mail]:
    """The owner's notice, throttled without state: none when an earlier proposal to this owner
    arrived during the quiet period (its notice covers these)."""
    since = datetime.now(UTC) - timedelta(minutes=NOTICE_QUIET_MINUTES)
    recent_others = await db.scalar(
        select(func.count())
        .select_from(ExerciseContribution)
        .where(
            ExerciseContribution.owner_id == owner_id,
            ExerciseContribution.id.not_in(list(new_ids)),
            ExerciseContribution.created_at >= since,
        )
    )
    if recent_others:
        return []
    owner = await db.get(Teacher, owner_id)
    if owner is None:
        return []
    pending = await db.scalar(
        select(func.count())
        .select_from(ExerciseContribution)
        .where(ExerciseContribution.owner_id == owner_id, ExerciseContribution.status == "pending")
    ) or 0
    return [account_mail.contribution_notice_mail(owner.email, pending)]


async def _close(db: AsyncSession, where: Sequence[ColumnElement[bool]], status: str) -> int:
    """Decide matching pending proposals and drop their payload (content and files)."""
    ids = list(
        (
            await db.execute(
                select(ExerciseContribution.id).where(
                    ExerciseContribution.status == "pending", *where
                )
            )
        ).scalars()
    )
    if not ids:
        return 0
    res = await db.execute(
        update(ExerciseContribution)
        .where(ExerciseContribution.id.in_(ids), ExerciseContribution.status == "pending")
        .values(
            status=status,
            decided_at=datetime.now(UTC),
            latex_body=None,
            correct_answers=None,
        )
        .execution_options(synchronize_session=False)
    )
    await db.execute(
        delete(ExerciseContributionResource).where(
            ExerciseContributionResource.contribution_id.in_(ids)
        )
    )
    return int(getattr(res, "rowcount", 0) or 0)


async def load_for(
    viewer: Teacher, contribution_id: uuid.UUID, db: AsyncSession
) -> ExerciseContribution:
    """The proposal, if *viewer* is its owner or contributor; 404 otherwise."""
    row = await db.get(ExerciseContribution, contribution_id)
    if row is None or viewer.id not in (row.owner_id, row.contributor_id):
        raise _not_found()
    return row


async def resolve_base(row: ExerciseContribution, db: AsyncSession) -> Exercise | None:
    """The owner's current row a version proposal applies to: the target if still current,
    else the current row of the same variant (the owner moved on); None if it is gone."""
    if row.kind != "version" or row.target_exercise_id is None:
        return None
    target = await db.get(Exercise, row.target_exercise_id)
    if target is not None and target.is_current and target.teacher_id == row.owner_id:
        return target
    key = target.variant_key if target is not None else row.variant_key
    return (
        await db.execute(
            select(Exercise).where(
                Exercise.teacher_id == row.owner_id,
                Exercise.exercise_group_id == row.source_group_id,
                Exercise.is_current.is_(True),
                Exercise.variant_key.is_(None) if key is None else Exercise.variant_key == key,
            )
        )
    ).scalars().first()


@dataclass
class Staleness:
    stale: bool
    target_gone: bool


async def staleness(row: ExerciseContribution, db: AsyncSession) -> Staleness:
    """Whether the owner's variant moved on since the contributor's last sync."""
    if row.kind != "version":
        return Staleness(False, False)
    base = await resolve_base(row, db)
    if base is None:
        return Staleness(True, True)
    digests = await resource_digests([base.id], db)
    current = content_fingerprint(base, digests.get(base.id, []))
    return Staleness(base.id != row.target_exercise_id or current != row.base_fingerprint, False)


async def accept(
    owner: Teacher,
    contribution_id: uuid.UUID,
    db: AsyncSession,
    *,
    latex_override: str | None = None,
    as_variant: bool = False,
    variant_key: str | None = None,
) -> Exercise:
    """Adopt a pending proposal as a new version (or new variant) in the owner's group."""
    row = await db.get(ExerciseContribution, contribution_id)
    if row is None or row.owner_id != owner.id:
        raise _not_found()
    if row.status != "pending":
        raise _decided()
    group = await db.get(ExerciseGroup, row.source_group_id)
    if group is None or group.teacher_id != owner.id:
        raise _not_found()

    content = edited_content(
        {
            "latex_body": row.latex_body,
            "question_type": row.question_type or "free_text",
            "correct_answers": row.correct_answers,
            "penalty": row.penalty,
            "max_points": row.max_points,
        },
        latex_override,
    )
    files = list(
        (
            await db.execute(
                select(ExerciseContributionResource).where(
                    ExerciseContributionResource.contribution_id == row.id
                )
            )
        ).scalars()
    )
    base = None if as_variant else await resolve_base(row, db)
    if row.kind == "version" and not as_variant and base is None:
        raise ContributionError(
            409,
            "The variant this proposal changes no longer exists; accept it as a new variant.",
            "ERR_CONTRIBUTION_TARGET_GONE",
        )

    # Claim first: of two concurrent accepts only one sees the row still pending.
    claimed = await db.execute(
        update(ExerciseContribution)
        .where(ExerciseContribution.id == row.id, ExerciseContribution.status == "pending")
        .values(status="accepted", decided_at=datetime.now(UTC))
        .execution_options(synchronize_session=False)
    )
    if not getattr(claimed, "rowcount", 0):
        raise _decided()

    if base is not None:
        result = next_version(base, **content)
    else:
        sibling = (
            await db.execute(
                select(Exercise).where(
                    Exercise.teacher_id == owner.id,
                    Exercise.exercise_group_id == group.id,
                    Exercise.is_current.is_(True),
                )
            )
        ).scalars().first()
        key = (variant_key or "").strip() or row.variant_key
        result = new_variant_row(group, sibling, variant_key=key, **content)
    db.add(result)
    await db.flush()
    for f in files:
        db.add(
            ExerciseResource(
                exercise_id=result.id,
                filename=f.filename,
                mime_type=f.mime_type,
                byte_size=f.byte_size,
                content=f.content,
                content_sha256=f.content_sha256,
            )
        )
    await db.execute(
        update(ExerciseContribution)
        .where(ExerciseContribution.id == row.id)
        .values(result_exercise_id=result.id, latex_body=None, correct_answers=None)
        .execution_options(synchronize_session=False)
    )
    await db.execute(
        delete(ExerciseContributionResource).where(
            ExerciseContributionResource.contribution_id == row.id
        )
    )
    await db.flush()
    return result


async def decide_without_merge(
    viewer: Teacher,
    contribution_id: uuid.UUID,
    db: AsyncSession,
    *,
    status: str,
    note: str | None = None,
) -> None:
    """Reject (owner) or withdraw (contributor) a pending proposal; never gated."""
    row = await db.get(ExerciseContribution, contribution_id)
    if row is None:
        raise _not_found()
    if viewer.id != (row.owner_id if status == "rejected" else row.contributor_id):
        raise _not_found()
    if row.status != "pending":
        raise _decided()
    await _close(db, (ExerciseContribution.id == row.id,), status)
    if status == "rejected" and note:
        await db.execute(
            update(ExerciseContribution)
            .where(ExerciseContribution.id == row.id)
            .values(decision_note=note.strip()[:1000] or None)
            .execution_options(synchronize_session=False)
        )
