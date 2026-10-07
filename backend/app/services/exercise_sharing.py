"""Exercise sharing (issue #65): who may read a foreign exercise, copying, and resyncing copies.

The only place that decides visibility. A foreign row is never linked into an exam, only copied,
and a resync only adds versions: an owner's edit or deletion never reaches a recipient's exams."""
from __future__ import annotations

import copy
import hashlib
import json
import uuid
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import ColumnElement, and_, false, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.exercise import Exercise
from app.models.exercise_group import ExerciseGroup
from app.models.exercise_resource import ExerciseResource
from app.models.teacher import Teacher
from app.services.latex_score import parse_exercise_score


def shared_with_clause(viewer: Teacher) -> ColumnElement[bool]:
    """Rows another account shared and *viewer* may see: current library rows with code whose
    owner is approved, has the switch on and has not paused. Checked per query (fails closed)."""
    if not viewer.allow_exercise_sharing:
        return false()
    # Correlate on exercises only: a caller that also joins teachers must not empty this subquery.
    owner_may_share = (
        select(Teacher.id)
        .where(
            Teacher.id == Exercise.teacher_id,
            Teacher.allow_exercise_sharing.is_(True),
            Teacher.sharing_paused.is_(False),
            Teacher.approved_at.is_not(None),
        )
        .correlate(Exercise)
        .exists()
    )
    return and_(
        Exercise.is_public.is_(True),
        Exercise.is_current.is_(True),
        Exercise.code_withheld.is_(False),
        Exercise.exam_id.is_(None),
        # Kept exercises of a deleted account are ownerless and visible to no one.
        Exercise.teacher_id.is_not(None),
        Exercise.teacher_id != viewer.id,
        owner_may_share,
    )


def readable_clause(viewer: Teacher) -> ColumnElement[bool]:
    """Rows *viewer* may read: their own, or shared with them. Never use it for writes or links."""
    return or_(Exercise.teacher_id == viewer.id, shared_with_clause(viewer))


# --- Fingerprints ---------------------------------------------------------

ResourceDigest = tuple[str, str, str]  # (filename, mime_type, content sha256)


def sha256_hex(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


async def resource_digests(
    exercise_ids: Iterable[uuid.UUID], db: AsyncSession
) -> dict[uuid.UUID, list[ResourceDigest]]:
    """Per exercise, its resources as digests. Bytes are read only for rows not hashed yet,
    whose hash is stored on the way (rows written before migration 0030)."""
    ids = list(dict.fromkeys(exercise_ids))
    out: dict[uuid.UUID, list[ResourceDigest]] = defaultdict(list)
    if not ids:
        return out
    rows = (
        await db.execute(
            select(
                ExerciseResource.id,
                ExerciseResource.exercise_id,
                ExerciseResource.filename,
                ExerciseResource.mime_type,
                ExerciseResource.content_sha256,
            ).where(ExerciseResource.exercise_id.in_(ids))
        )
    ).all()
    missing = [r.id for r in rows if r.content_sha256 is None]
    filled: dict[uuid.UUID, str] = {}
    if missing:
        for res in (
            await db.execute(select(ExerciseResource).where(ExerciseResource.id.in_(missing)))
        ).scalars():
            res.content_sha256 = sha256_hex(res.content)
            filled[res.id] = res.content_sha256
    for r in rows:
        out[r.exercise_id].append((r.filename, r.mime_type, r.content_sha256 or filled[r.id]))
    return out


def content_fingerprint(ex: Exercise, resources: Sequence[ResourceDigest]) -> str:
    """SHA-256 of what a resync carries over. Name, topic, grade, subject and variant key are
    the recipient's own organisation and deliberately left out."""
    payload = {
        "latex_body": ex.latex_body or "",
        "question_type": ex.question_type,
        "correct_answers": ex.correct_answers,
        "penalty": float(ex.penalty or 0.0),
        "max_points": float(ex.max_points or 0.0),
        "resources": sorted([list(r) for r in resources]),
    }
    data = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return sha256_hex(data.encode("utf-8"))


# --- Copying --------------------------------------------------------------


async def copy_resources(source_id: uuid.UUID, target_id: uuid.UUID, db: AsyncSession) -> None:
    """Duplicate every resource of *source_id* onto *target_id* (versions, variants, copies)."""
    rows = (
        (
            await db.execute(
                select(ExerciseResource).where(ExerciseResource.exercise_id == source_id)
            )
        )
        .scalars()
        .all()
    )
    for row in rows:
        db.add(
            ExerciseResource(
                exercise_id=target_id,
                filename=row.filename,
                mime_type=row.mime_type,
                byte_size=row.byte_size,
                content=row.content,
                content_sha256=row.content_sha256 or sha256_hex(row.content),
            )
        )
    if rows:
        await db.flush()


def next_version(old: Exercise, **content: object) -> Exercise:
    """The row that supersedes *old*: version + 1, same owner, group, variant, share state and
    provenance; *content* overrides fields. *old* stays as history, so exams linking it keep it."""
    old.is_current = False
    fields: dict[str, object] = {
        "teacher_id": old.teacher_id,
        "name": old.name,
        "topic_tag": old.topic_tag,
        "grade": old.grade,
        "subject": old.subject,
        "latex_body": old.latex_body,
        "max_points": old.max_points,
        "version": old.version + 1,
        "exercise_group_id": old.exercise_group_id,
        "variant_key": old.variant_key,
        "is_current": True,
        "question_type": old.question_type,
        "correct_answers": old.correct_answers,
        "penalty": old.penalty,
        "is_public": old.is_public,
        "shared_at": old.shared_at,
        "copied_from_exercise_id": old.copied_from_exercise_id,
        "synced_fingerprint": old.synced_fingerprint,
    }
    fields.update(content)
    return Exercise(**fields)


def _content_from(src: Exercise) -> dict[str, object]:
    return {
        "latex_body": src.latex_body,
        "max_points": src.max_points,
        "question_type": src.question_type,
        "correct_answers": copy.deepcopy(src.correct_answers),
        "penalty": src.penalty,
    }


async def shared_group_rows(
    source: Exercise, viewer: Teacher, db: AsyncSession
) -> list[Exercise]:
    """The current shared rows of *source*'s group that *viewer* may see."""
    if source.exercise_group_id is None:
        return [source]
    rows = (
        await db.execute(
            select(Exercise)
            .where(
                Exercise.exercise_group_id == source.exercise_group_id,
                shared_with_clause(viewer),
            )
            .order_by(Exercise.variant_key.asc(), Exercise.version.desc())
        )
    ).scalars()
    return list(rows)


async def copy_shared_group(
    source: Exercise, viewer: Teacher, db: AsyncSession
) -> tuple[ExerciseGroup, list[Exercise]]:
    """Copy *source*'s shared group into a new private group of *viewer*, linked for resync."""
    sources = await shared_group_rows(source, viewer, db)
    digests = await resource_digests([s.id for s in sources], db)
    group = ExerciseGroup(
        teacher_id=viewer.id,
        name=source.name or "Untitled Group",
        topic_tag=source.topic_tag,
        grade=source.grade,
        subject=source.subject,
        source_group_id=source.exercise_group_id,
        copied_at=datetime.now(UTC),
    )
    db.add(group)
    await db.flush()
    created: list[Exercise] = []
    for src in sources:
        row = Exercise(
            teacher_id=viewer.id,
            name=group.name,
            topic_tag=group.topic_tag,
            grade=group.grade,
            subject=group.subject,
            version=1,
            exercise_group_id=group.id,
            variant_key=src.variant_key,
            is_current=True,
            copied_from_exercise_id=src.id,
            synced_fingerprint=content_fingerprint(src, digests.get(src.id, [])),
            **_content_from(src),
        )
        db.add(row)
        await db.flush()
        await copy_resources(src.id, row.id, db)
        created.append(row)
    return group, created


# --- Sync status and resync -----------------------------------------------

SyncState = Literal["up_to_date", "update_available", "source_unavailable"]


@dataclass
class VariantPlan:
    source: Exercise | None
    own: Exercise | None
    source_fingerprint: str | None = None
    # "local": a variant the recipient added to the copy; it can be proposed to the original.
    kind: Literal["changed", "new", "unchanged", "removed", "local"] = "unchanged"
    locally_modified: bool = False


@dataclass
class GroupPlan:
    group: ExerciseGroup
    state: SyncState
    variants: list[VariantPlan] = field(default_factory=list)

    @property
    def locally_modified(self) -> bool:
        return any(v.locally_modified for v in self.variants)

    def count(self, kind: str) -> int:
        return sum(1 for v in self.variants if v.kind == kind)

    @property
    def applicable(self) -> list[VariantPlan]:
        return [v for v in self.variants if v.kind in ("changed", "new")]


async def plan_groups(
    viewer: Teacher, db: AsyncSession, group_id: uuid.UUID | None = None
) -> list[GroupPlan]:
    """Compare *viewer*'s linked groups (or one of them) with their sources."""
    query = select(ExerciseGroup).where(
        ExerciseGroup.teacher_id == viewer.id, ExerciseGroup.source_group_id.is_not(None)
    )
    if group_id is not None:
        query = query.where(ExerciseGroup.id == group_id)
    groups = list((await db.execute(query)).scalars())
    if not groups:
        return []

    own_rows = list(
        (
            await db.execute(
                select(Exercise).where(
                    Exercise.teacher_id == viewer.id,
                    Exercise.exercise_group_id.in_([g.id for g in groups]),
                    Exercise.is_current.is_(True),
                )
            )
        ).scalars()
    )
    source_rows = list(
        (
            await db.execute(
                select(Exercise).where(
                    Exercise.exercise_group_id.in_(
                        [g.source_group_id for g in groups if g.source_group_id]
                    ),
                    shared_with_clause(viewer),
                )
            )
        ).scalars()
    )
    # Where each copy came from, to match a variant whose source has a newer version since.
    lineage_ids = [r.copied_from_exercise_id for r in own_rows if r.copied_from_exercise_id]
    lineage = {
        row.id: (row.exercise_group_id, row.variant_key)
        for row in (
            await db.execute(
                select(Exercise.id, Exercise.exercise_group_id, Exercise.variant_key).where(
                    Exercise.id.in_(lineage_ids)
                )
            )
        ).all()
    }
    digests = await resource_digests([r.id for r in own_rows + source_rows], db)

    plans: list[GroupPlan] = []
    for group in groups:
        mine = [
            r for r in own_rows if r.exercise_group_id == group.id and r.copied_from_exercise_id
        ]
        theirs = [r for r in source_rows if r.exercise_group_id == group.source_group_id]
        plan = GroupPlan(group=group, state="source_unavailable" if not theirs else "up_to_date")
        matched: set[uuid.UUID] = set()
        for src in theirs:
            own = _match(src, mine, matched, lineage)
            fp = content_fingerprint(src, digests.get(src.id, []))
            variant = VariantPlan(source=src, own=own, source_fingerprint=fp)
            if own is None:
                variant.kind = "new"
            else:
                matched.add(own.id)
                variant.locally_modified = (
                    content_fingerprint(own, digests.get(own.id, [])) != own.synced_fingerprint
                )
                variant.kind = "unchanged" if fp == own.synced_fingerprint else "changed"
            plan.variants.append(variant)
        for own in own_rows:
            if own.exercise_group_id == group.id and not own.copied_from_exercise_id:
                plan.variants.append(VariantPlan(source=None, own=own, kind="local"))
        for own in mine:
            if own.id not in matched:
                plan.variants.append(
                    VariantPlan(
                        source=None,
                        own=own,
                        kind="removed",
                        locally_modified=content_fingerprint(own, digests.get(own.id, []))
                        != own.synced_fingerprint,
                    )
                )
        if theirs and plan.applicable:
            plan.state = "update_available"
        plans.append(plan)
    return plans


def _match(
    src: Exercise,
    mine: list[Exercise],
    taken: set[uuid.UUID],
    lineage: dict[uuid.UUID, tuple[uuid.UUID | None, str | None]],
) -> Exercise | None:
    """The copy row that tracks *src*: same source row, else a row copied from an earlier
    version of the same source variant, else (lineage gone) the same variant key."""
    free = [r for r in mine if r.id not in taken]
    for row in free:
        if row.copied_from_exercise_id == src.id:
            return row
    for row in free:
        origin = lineage.get(row.copied_from_exercise_id) if row.copied_from_exercise_id else None
        if origin == (src.exercise_group_id, src.variant_key):
            return row
    for row in free:
        if row.copied_from_exercise_id not in lineage and row.variant_key == src.variant_key:
            return row
    return None


class ResyncConflict(Exception):
    """The source changed after the preview the client reviewed."""


def new_variant_row(group: ExerciseGroup, sibling: Exercise | None, **content: object) -> Exercise:
    """Version 1 of a new variant in *group*; it joins the group's share state like one made
    in the editor. *content* carries variant key, LaTeX, answers and provenance."""
    shared = bool(sibling and sibling.is_public)
    fields: dict[str, object] = {
        "teacher_id": group.teacher_id,
        "name": group.name,
        "topic_tag": group.topic_tag,
        "grade": group.grade,
        "subject": group.subject,
        "version": 1,
        "exercise_group_id": group.id,
        "is_current": True,
        "is_public": shared,
        "shared_at": sibling.shared_at if sibling and shared else None,
    }
    fields.update(content)
    return Exercise(**fields)


def edited_content(base: dict[str, object], latex_body: str | None) -> dict[str, object]:
    """*base* content with the user's edited LaTeX (points follow it); None keeps *base*."""
    if latex_body is None:
        return base
    points = parse_exercise_score(latex_body) if latex_body.strip() else base["max_points"]
    return {**base, "latex_body": latex_body, "max_points": points}


async def apply_resync(
    plan: GroupPlan,
    reviewed: dict[uuid.UUID, str],
    db: AsyncSession,
    overrides: dict[uuid.UUID, str] | None = None,
) -> list[Exercise]:
    """Take over the *reviewed* variants (source row id -> fingerprint the user saw; a subset is
    fine, the rest stays pending). Compare-and-set per variant. *overrides* holds edited LaTeX.
    Never updates a row in place: changes become new versions."""
    overrides = overrides or {}
    applicable = {v.source.id: v for v in plan.applicable if v.source}
    if not reviewed or any(
        sid not in applicable or applicable[sid].source_fingerprint != fp
        for sid, fp in reviewed.items()
    ):
        raise ResyncConflict
    if not set(overrides) <= set(reviewed):
        raise ResyncConflict
    sibling = next((v.own for v in plan.variants if v.own is not None), None)
    created: list[Exercise] = []
    for sid in reviewed:
        variant = applicable[sid]
        src = variant.source
        if src is None:
            continue
        content = edited_content(_content_from(src), overrides.get(sid))
        if variant.own is not None:
            row = next_version(
                variant.own,
                copied_from_exercise_id=src.id,
                synced_fingerprint=variant.source_fingerprint,
                **content,
            )
        else:
            row = new_variant_row(
                plan.group,
                sibling,
                variant_key=src.variant_key,
                copied_from_exercise_id=src.id,
                synced_fingerprint=variant.source_fingerprint,
                **content,
            )
        db.add(row)
        await db.flush()
        await copy_resources(src.id, row.id, db)
        created.append(row)
    return created
