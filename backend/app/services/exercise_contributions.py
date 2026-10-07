"""Proposals from a linked copy back to the shared original (issue #65).

An owner's library changes only when the owner accepts a reviewed, immutable snapshot, and then
only by adding a version or a variant; nothing an exam links is ever updated in place."""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
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
    file_fields,
    new_variant_row,
    next_version,
    plan_group,
    resource_digests,
)

MAX_PENDING_PER_CONTRIBUTOR = 20
NOTICE_QUIET_MINUTES = 15


class ContributionError(HTTPException):
    def __init__(self, status: int, detail: str, code: str | None = None) -> None:
        super().__init__(status, detail, headers={"code": code} if code else None)


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
    plan = await plan_group(contributor, db, group_id, lock=True)
    sources = [v.source for v in plan.variants if v.source is not None]
    if not sources or plan.group.source_group_id is None:
        raise ContributionError(
            404, "The original is no longer shared.", "ERR_SHARE_SOURCE_UNAVAILABLE"
        )
    owner_id = sources[0].teacher_id  # never None: shared rows have an approved owner
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
            message=(message or "").strip() or None,
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
            db.add(ExerciseContributionResource(contribution_id=row.id, **file_fields(f)))
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


async def _close(
    db: AsyncSession, where: Sequence[ColumnElement[bool]], status: str, **extra: object
) -> int:
    """Decide matching pending proposals and drop their payload (content and files): the only
    place a payload is cleared. Returns how many were still pending, i.e. claimed here."""
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
            **extra,
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
    viewer: Teacher, contribution_id: uuid.UUID, db: AsyncSession, *, refresh: bool = False
) -> ExerciseContribution:
    """The proposal, if *viewer* is its owner or contributor; 404 otherwise. *refresh* re-reads
    it after a bulk UPDATE in this request."""
    row = await db.get(ExerciseContribution, contribution_id, populate_existing=refresh)
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
    # The group lock serializes accepts into one group: two proposals for one variant must not
    # both version the same current row.
    group = await db.get(ExerciseGroup, row.source_group_id, with_for_update=True)
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
    files = [
        file_fields(f)
        for f in (
            await db.execute(
                select(ExerciseContributionResource).where(
                    ExerciseContributionResource.contribution_id == row.id
                )
            )
        ).scalars()
    ]
    base = None if as_variant else await resolve_base(row, db)
    if row.kind == "version" and not as_variant and base is None:
        raise ContributionError(
            409,
            "The variant this proposal changes no longer exists; accept it as a new variant.",
            "ERR_CONTRIBUTION_TARGET_GONE",
        )

    if base is not None:
        result = next_version(base, **content)
    else:
        current = list(
            (
                await db.execute(
                    select(Exercise).where(
                        Exercise.teacher_id == owner.id,
                        Exercise.exercise_group_id == group.id,
                        Exercise.is_current.is_(True),
                    )
                )
            ).scalars()
        )
        key = (variant_key or "").strip() or row.variant_key
        if any(r.variant_key == key for r in current):
            # A second current row with one key would make later matching ambiguous.
            raise ContributionError(
                409, "This variant key already exists in the exercise.", "ERR_VARIANT_KEY_TAKEN"
            )
        result = new_variant_row(
            group, current[0] if current else None, variant_key=key, **content
        )
    db.add(result)
    await db.flush()
    for f in files:
        db.add(ExerciseResource(exercise_id=result.id, **f))
    # The claim: of two concurrent decisions only one sees the row still pending; the loser's
    # new row is rolled back with its request.
    if not await _close(
        db, (ExerciseContribution.id == row.id,), "accepted", result_exercise_id=result.id
    ):
        raise _decided()
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
    note = ((note or "").strip() or None) if status == "rejected" else None
    if not await _close(db, (ExerciseContribution.id == row.id,), status, decision_note=note):
        raise _decided()
