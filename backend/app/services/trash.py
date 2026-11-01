"""Trash (issue #125): every teacher delete first copies exactly the rows it removes, and a restore puts back only what is missing, never overwriting. Design and rules: docs/dev/trash.md."""
from __future__ import annotations

import base64
import json
import uuid
import zlib
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import (
    Date,
    DateTime,
    LargeBinary,
    Table,
    UniqueConstraint,
    Uuid,
    and_,
    delete,
    insert,
    literal,
    select,
    tuple_,
    update,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import Base
from app.dependencies import get_teaching_teacher
from app.models.exam import Exam
from app.models.exam_exercise import ExamExercise
from app.models.exam_mc_group import ExamMcGroup
from app.models.exercise import Exercise
from app.models.exercise_contribution import ExerciseContribution, ExerciseContributionResource
from app.models.exercise_group import ExerciseGroup
from app.models.exercise_resource import ExerciseResource
from app.models.exercise_score import ExerciseScore
from app.models.logo import ExamLogo, TeacherLogo
from app.models.scan_submission import ScanSubmission
from app.models.student_identity import StudentIdentity
from app.models.teacher import Teacher
from app.models.trash_item import TrashItem
from app.services import audit as audit_svc
from app.services import blob_store
from app.services.capabilities import require_server_results_writable
from app.services.tokens import rowcount

# Parents before children: restore inserts in this order, delete runs it backwards.
TABLE_ORDER: tuple[str, ...] = (
    "exams",
    "exam_mc_groups",
    "exam_exercises",
    "exam_logos",
    "exercises",
    "exercise_resources",
    "student_identities",
    "scan_submissions",
    "exercise_scores",
    "teacher_logos",
    "exercise_contribution_resources",
)
# Grading results: restoring them is a result write (server_results gate).
RESULT_TABLES = frozenset({"student_identities", "scan_submissions", "exercise_scores"})
_CHUNK = 500


def _table(name: str) -> Table:
    return Base.metadata.tables[name]


def _encode_value(value: Any) -> Any:
    if isinstance(value, bytes):
        return base64.b64encode(value).decode()
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    return value


def _encode(row: dict[str, Any]) -> dict[str, Any]:
    return {name: _encode_value(value) for name, value in row.items()}


def _decode(table: Table, row: dict[str, Any]) -> dict[str, Any]:
    """Back to Python values by the column types, so a payload never needs type tags."""
    out = dict(row)
    for col in table.columns:
        value = out.get(col.name)
        if value is None:
            continue
        kind = col.type
        if isinstance(kind, LargeBinary):
            out[col.name] = base64.b64decode(value)
        elif isinstance(kind, DateTime):
            out[col.name] = datetime.fromisoformat(value)
        elif isinstance(kind, Date):
            out[col.name] = date.fromisoformat(value)
        elif isinstance(kind, Uuid):
            out[col.name] = uuid.UUID(value)
    return out


def _pk(table: Table, row: dict[str, Any]) -> dict[str, Any]:
    return {col.name: row[col.name] for col in table.primary_key.columns}


def _row_ref(table: Table, row: dict[str, Any]) -> str:
    return "/".join(str(v) for v in _pk(table, row).values())


@dataclass
class Fill:
    """An in-place clear (grading, logo set to none, a closed proposal): restore refills *cols* only while the row still matches *null* and *equal*, and inserts the whole row when it is gone and *insert* allows."""

    table: str
    row: dict[str, Any]
    cols: list[str]
    null: list[str]
    equal: dict[str, Any] = field(default_factory=dict)
    insert: bool = False


@dataclass
class Snapshot:
    """What one delete removes: whole rows per table plus in-place fills."""

    rows: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    fills: list[Fill] = field(default_factory=list)
    meta: dict[str, Any] = field(default_factory=dict)

    async def add(self, db: AsyncSession, model: type[Base], *where: Any) -> list[dict[str, Any]]:
        """Copy the matching rows of *model*; Core select, so deferred columns are included."""
        table = _table(model.__tablename__)
        result = await db.execute(select(table).where(*where))
        rows = [dict(r._mapping) for r in result]
        known = {_row_ref(table, r) for r in self.rows.get(table.name, [])}
        fresh = [r for r in rows if _row_ref(table, r) not in known]
        if fresh:
            self.rows.setdefault(table.name, []).extend(fresh)
        return rows

    def fill(self, model: type[Base], row: dict[str, Any], cols: Sequence[str], **kw: Any) -> None:
        if any(row.get(c) is not None for c in cols) or kw.get("insert"):
            self.fills.append(Fill(model.__tablename__, row, list(cols), **kw))

    @property
    def empty(self) -> bool:
        return not self.rows and not self.fills

    def counts(self) -> dict[str, int]:
        counts = {name: len(rows) for name, rows in self.rows.items()}
        for f in self.fills:
            counts[f.table] = counts.get(f.table, 0) + 1
        return counts

    def blob_refs(self) -> list[str]:
        subs = self.rows.get("scan_submissions", [])
        return sorted({r["scan_path"] for r in subs if r.get("scan_path")})

    def encode(self) -> bytes:
        doc = {
            "rows": {name: [_encode(r) for r in rows] for name, rows in self.rows.items()},
            "fills": [
                {
                    "table": f.table,
                    "row": _encode(f.row),
                    "cols": f.cols,
                    "null": f.null,
                    "equal": _encode(f.equal),
                    "insert": f.insert,
                }
                for f in self.fills
            ],
            "meta": self.meta,
        }
        return zlib.compress(json.dumps(doc, separators=(",", ":")).encode())

    async def delete(self, db: AsyncSession) -> None:
        """Delete exactly the copied rows, children first (SQLite in tests enforces no cascades)."""
        await db.flush()
        for name in reversed(TABLE_ORDER):
            rows = self.rows.get(name)
            if not rows:
                continue
            table = _table(name)
            pk_cols = list(table.primary_key.columns)
            for start in range(0, len(rows), _CHUNK):
                chunk = rows[start : start + _CHUNK]
                if len(pk_cols) == 1:
                    key = pk_cols[0]
                    where = key.in_([r[key.name] for r in chunk])
                else:
                    where = tuple_(*pk_cols).in_([tuple(r[c.name] for c in pk_cols) for r in chunk])
                await db.execute(delete(table).where(where))


def _decode_doc(payload: bytes) -> dict[str, Any]:
    doc: dict[str, Any] = json.loads(zlib.decompress(payload))
    return doc


# --- snapshots per kind ----------------------------------------------------------------------


async def _scores_of(snap: Snapshot, db: AsyncSession, sub_ids: Iterable[uuid.UUID]) -> None:
    ids = list(sub_ids)
    for start in range(0, len(ids), _CHUNK):
        await snap.add(db, ExerciseScore, ExerciseScore.submission_id.in_(ids[start : start + _CHUNK]))


async def snapshot_exam(db: AsyncSession, exam: Exam) -> Snapshot:
    """The exam and everything its delete cascades to (links, MC groups, logo, results)."""
    await db.flush()
    snap = Snapshot(meta={"pseudonym_versions": {str(exam.id): exam.pseudonym_version}})
    await snap.add(db, Exam, Exam.id == exam.id)
    await snap.add(db, ExamMcGroup, ExamMcGroup.exam_id == exam.id)
    await snap.add(db, ExamExercise, ExamExercise.exam_id == exam.id)
    await snap.add(db, ExamLogo, ExamLogo.exam_id == exam.id)
    await snap.add(db, StudentIdentity, StudentIdentity.exam_id == exam.id)
    subs = await snap.add(db, ScanSubmission, ScanSubmission.exam_id == exam.id)
    await _scores_of(snap, db, [s["id"] for s in subs])
    return snap


async def snapshot_student(db: AsyncSession, exam: Exam, pseudonym_hmac: str) -> Snapshot:
    """One student of an exam with all of their submissions and scores."""
    await db.flush()
    snap = Snapshot(meta={"pseudonym_versions": {str(exam.id): exam.pseudonym_version}})
    await snap.add(
        db,
        StudentIdentity,
        StudentIdentity.exam_id == exam.id,
        StudentIdentity.pseudonym_hmac == pseudonym_hmac,
    )
    subs = await snap.add(
        db,
        ScanSubmission,
        ScanSubmission.exam_id == exam.id,
        ScanSubmission.pseudonym_hmac == pseudonym_hmac,
    )
    await _scores_of(snap, db, [s["id"] for s in subs])
    return snap


async def snapshot_submission(db: AsyncSession, exam: Exam, sub_id: uuid.UUID) -> Snapshot:
    await db.flush()
    snap = Snapshot(meta={"pseudonym_versions": {str(exam.id): exam.pseudonym_version}})
    await snap.add(db, ScanSubmission, ScanSubmission.id == sub_id)
    await _scores_of(snap, db, [sub_id])
    return snap


async def snapshot_scores(
    db: AsyncSession, sub_id: uuid.UUID, exercise_id: uuid.UUID | None = None
) -> Snapshot:
    await db.flush()
    snap = Snapshot()
    where = [ExerciseScore.submission_id == sub_id]
    if exercise_id is not None:
        where.append(ExerciseScore.exercise_id == exercise_id)
    await snap.add(db, ExerciseScore, *where)
    return snap


_ANNOTATION = ["annotation_ciphertext", "annotation_iv"]


async def snapshot_grading(db: AsyncSession, sub_id: uuid.UUID, *, scores: bool = True) -> Snapshot:
    """The grading a clear blanks in place (annotations, total) and the per-exercise scores it deletes."""
    await db.flush()
    snap = Snapshot()
    row = (await db.execute(select(_table("scan_submissions")).where(
        _table("scan_submissions").c.id == sub_id
    ))).mappings().one_or_none()
    if row is not None:
        cols = [*_ANNOTATION, "total_score"] if scores else list(_ANNOTATION)
        keep = {c: row[c] for c in ("id", *cols)}
        snap.fill(ScanSubmission, keep, cols, null=cols)
    if scores:
        await _scores_of(snap, db, [sub_id])
    return snap


async def snapshot_exercise(
    db: AsyncSession, ex: Exercise, promoted: Exercise | None
) -> Snapshot:
    """One exercise version, its files, and the exam links and scores its delete cascades to."""
    await db.flush()
    snap = Snapshot(meta={"promoted": str(promoted.id) if promoted else None})
    await snap.add(db, Exercise, Exercise.id == ex.id)
    await snap.add(db, ExerciseResource, ExerciseResource.exercise_id == ex.id)
    await snap.add(db, ExamExercise, ExamExercise.exercise_id == ex.id)
    await snap.add(db, ExerciseScore, ExerciseScore.exercise_id == ex.id)
    return snap


async def snapshot_resource(db: AsyncSession, resource_id: uuid.UUID) -> Snapshot:
    await db.flush()
    snap = Snapshot()
    await snap.add(db, ExerciseResource, ExerciseResource.id == resource_id)
    return snap


_LOGO_COLS = ["mode", "mime_type", "byte_size", "content", "updated_at"]


async def snapshot_logo(db: AsyncSession, model: type[TeacherLogo] | type[ExamLogo], *where: Any) -> Snapshot:
    """A logo row about to be deleted or set to `none`: restore inserts it, or refills a row still at `none`."""
    await db.flush()
    snap = Snapshot()
    table = _table(model.__tablename__)
    row = (await db.execute(select(table).where(*where))).mappings().one_or_none()
    if row is not None:
        snap.fill(model, dict(row), _LOGO_COLS, null=["content"], equal={"mode": "none"}, insert=True)
    return snap


async def snapshot_exam_links(
    db: AsyncSession,
    exam_id: uuid.UUID,
    *,
    kept_exercises: set[uuid.UUID] | None,
    kept_groups: set[uuid.UUID] | None,
) -> Snapshot:
    """The exercise links and MC groups an exam edit drops (None: that set is not replaced)."""
    await db.flush()
    snap = Snapshot()
    if kept_groups is not None:
        await snap.add(db, ExamMcGroup, ExamMcGroup.exam_id == exam_id, ExamMcGroup.id.not_in(kept_groups))
    if kept_exercises is not None:
        await snap.add(
            db,
            ExamExercise,
            ExamExercise.exam_id == exam_id,
            ExamExercise.exercise_id.not_in(kept_exercises),
        )
    return snap


_CONTRIBUTION_COLS = ["latex_body", "correct_answers", "status", "decided_at", "decision_note"]


async def snapshot_contribution(db: AsyncSession, contribution_id: uuid.UUID, closed_as: str) -> Snapshot:
    """A pending proposal about to be rejected or withdrawn: restore reopens it while it is still closed and empty."""
    await db.flush()
    snap = Snapshot()
    table = _table("exercise_contributions")
    row = (await db.execute(select(table).where(table.c.id == contribution_id))).mappings().one_or_none()
    if row is None or row["status"] != "pending":
        return snap
    keep = {c: row[c] for c in ("id", *_CONTRIBUTION_COLS)}
    snap.fill(ExerciseContribution, keep, _CONTRIBUTION_COLS, null=["latex_body"], equal={"status": closed_as})
    await snap.add(
        db,
        ExerciseContributionResource,
        ExerciseContributionResource.contribution_id == contribution_id,
    )
    return snap


# --- labels ------------------------------------------------------------------------------------


def _b64(value: bytes | None) -> str | None:
    return base64.b64encode(value).decode() if value else None


async def result_label(db: AsyncSession, exam: Exam, pseudonym_hmac: str | None) -> dict[str, Any]:
    """Exam title plus the sealed identity, so the browser can show the student's name."""
    label: dict[str, Any] = {"exam_id": str(exam.id), "exam_title": exam.title}
    if pseudonym_hmac is None:
        return label
    label["pseudonym_hmac"] = pseudonym_hmac
    label["pseudonym_version"] = exam.pseudonym_version
    identity = await db.get(StudentIdentity, (pseudonym_hmac, exam.id))
    if identity is not None:
        label["pii_ciphertext_b64"] = _b64(identity.pii_ciphertext)
        label["iv_b64"] = _b64(identity.iv)
        label["encryption_salt_b64"] = _b64(identity.encryption_salt)
    return label


def exam_label(exam: Exam) -> dict[str, Any]:
    return {"exam_id": str(exam.id), "exam_title": exam.title}


def exercise_label(ex: Exercise) -> dict[str, Any]:
    return {"exercise_id": str(ex.id), "exercise_name": ex.name, "version": ex.version}


# --- capture -----------------------------------------------------------------------------------


@dataclass
class TrashScope:
    """The trash group of this request: one UI action may send several deletes under one `X-Trash-Group`."""

    request: Request
    teacher: Teacher
    group_id: uuid.UUID

    async def capture(
        self,
        db: AsyncSession,
        kind: str,
        snap: Snapshot,
        *,
        label: dict[str, Any] | None = None,
        exam_id: uuid.UUID | None = None,
    ) -> TrashItem | None:
        """Store *snap* in the trash, in the caller's transaction. Nothing is stored for an empty snapshot."""
        if snap.empty:
            return None
        now = datetime.now(UTC)
        item = TrashItem(
            id=uuid.uuid4(),
            teacher_id=self.teacher.id,
            group_id=self.group_id,
            kind=kind,
            exam_id=exam_id,
            label={**(label or {}), "counts": snap.counts()},
            payload=snap.encode(),
            blob_refs=snap.blob_refs(),
            deleted_at=now,
            purge_after=now + timedelta(days=settings.RETENTION_GRACE_DAYS),
        )
        db.add(item)
        await audit_svc.log(db, self.request, self.teacher, "TRASH_CAPTURED", item.id)
        return item


def _parse_group(raw: str | None) -> uuid.UUID:
    try:
        return uuid.UUID(raw) if raw else uuid.uuid4()
    except ValueError:
        return uuid.uuid4()


async def trash_scope(
    request: Request,
    teacher: Teacher = Depends(get_teaching_teacher),
    x_trash_group: str | None = Header(default=None, include_in_schema=False),
) -> TrashScope:
    """Without a valid header every request is its own group."""
    return TrashScope(request=request, teacher=teacher, group_id=_parse_group(x_trash_group))


Trash = Annotated[TrashScope, Depends(trash_scope)]


# --- list, restore, purge ----------------------------------------------------------------------


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Trash entry not found.",
        headers={"code": "ERR_TRASH_NOT_FOUND"},
    )


async def list_items(db: AsyncSession, teacher: Teacher) -> list[TrashItem]:
    now = datetime.now(UTC)
    rows = await db.scalars(
        select(TrashItem)
        .where(TrashItem.teacher_id == teacher.id, TrashItem.purge_after >= now)
        .order_by(TrashItem.deleted_at.desc())
    )
    return list(rows)


async def group_items(db: AsyncSession, teacher: Teacher, group_id: uuid.UUID) -> list[TrashItem]:
    """The teacher's entries of one group; a foreign or missing group is the same 404."""
    rows = list(
        await db.scalars(
            select(TrashItem)
            .where(TrashItem.teacher_id == teacher.id, TrashItem.group_id == group_id)
            .order_by(TrashItem.deleted_at)
        )
    )
    if not rows:
        raise _not_found()
    return rows


@dataclass
class RestoreReport:
    restored: dict[str, int] = field(default_factory=dict)
    skipped: list[dict[str, str | None]] = field(default_factory=list)

    def ok(self, table: str) -> None:
        self.restored[table] = self.restored.get(table, 0) + 1

    def skip(self, table: str, ref: str | None, reason: str) -> None:
        self.skipped.append({"table": table, "id": ref, "reason": reason})


async def _exists(db: AsyncSession, table: Table, values: dict[str, Any]) -> bool:
    where = [table.c[name] == value for name, value in values.items()]
    return await db.scalar(select(literal(1)).select_from(table).where(*where).limit(1)) is not None


async def _attach_parents(
    db: AsyncSession, table: Table, row: dict[str, Any], report: RestoreReport
) -> bool:
    """False when a required parent is gone; a nullable link to a gone parent is cleared and reported."""
    for fk in table.foreign_key_constraints:
        values = {el.parent.name: row.get(el.parent.name) for el in fk.elements}
        if any(v is None for v in values.values()):
            continue
        target = fk.referred_table
        where = and_(*(el.column == row[el.parent.name] for el in fk.elements))
        if await db.scalar(select(literal(1)).select_from(target).where(where).limit(1)) is not None:
            continue
        if all(table.c[name].nullable for name in values):
            for name in values:
                row[name] = None
            report.skip(table.name, _row_ref(table, row), "detached")
            continue
        report.skip(table.name, _row_ref(table, row), "parent_missing")
        return False
    return True


async def _taken(db: AsyncSession, table: Table, row: dict[str, Any]) -> bool:
    """The primary key or a unique key is already in use (re-created since, or never deleted)."""
    keys: list[list[str]] = [[c.name for c in table.primary_key.columns]]
    keys += [[c.name for c in con.columns] for con in table.constraints if isinstance(con, UniqueConstraint)]
    keys += [[c.name for c in idx.columns] for idx in table.indexes if idx.unique]
    for names in keys:
        values = {n: row.get(n) for n in names}
        if any(v is None for v in values.values()):
            continue
        if await _exists(db, table, values):
            return True
    return False


async def _current_rival(db: AsyncSession, row: dict[str, Any]) -> Exercise | None:
    """Another current row of the restored version's variant, read under the group lock."""
    group_id = row.get("exercise_group_id")
    if group_id is None or not row.get("is_current"):
        return None
    await db.execute(select(ExerciseGroup.id).where(ExerciseGroup.id == group_id).with_for_update())
    variant = row.get("variant_key")
    return await db.scalar(
        select(Exercise).where(
            Exercise.exercise_group_id == group_id,
            Exercise.variant_key.is_(None) if variant is None else Exercise.variant_key == variant,
            Exercise.is_current.is_(True),
            Exercise.id != row["id"],
        )
    )


async def _restore_row(
    db: AsyncSession,
    table: Table,
    row: dict[str, Any],
    meta: dict[str, Any],
    report: RestoreReport,
    versions: dict[uuid.UUID, int | None],
) -> None:
    ref = _row_ref(table, row)
    if table.name in ("student_identities", "scan_submissions"):
        captured = meta.get("pseudonym_versions", {}).get(str(row["exam_id"]))
        if row["exam_id"] not in versions:
            versions[row["exam_id"]] = await db.scalar(
                select(Exam.pseudonym_version).where(Exam.id == row["exam_id"])
            )
        live = versions[row["exam_id"]]
        if captured is not None and live is not None and live != captured:
            report.skip(table.name, ref, "pseudonym_changed")
            return
    if await _taken(db, table, row):
        report.skip(table.name, ref, "already_exists")
        return
    if not await _attach_parents(db, table, row, report):
        return
    if table.name == "exercises":
        rival = await _current_rival(db, row)
        if rival is not None:
            if meta.get("promoted") == str(rival.id):
                # Undo exactly the promotion this delete made.
                rival.is_current = False
                await db.flush()
            else:
                row["is_current"] = False
                report.skip(table.name, ref, "older_version")
    await db.execute(insert(table).values(**row))
    report.ok(table.name)


async def _apply_fill(db: AsyncSession, fill: dict[str, Any], report: RestoreReport) -> None:
    table = _table(fill["table"])
    row = _decode(table, fill["row"])
    ref = _row_ref(table, row)
    pk = _pk(table, row)
    if not await _exists(db, table, pk):
        if not fill.get("insert"):
            report.skip(table.name, ref, "gone")
            return
        if not await _attach_parents(db, table, row, report):
            return
        await db.execute(insert(table).values(**row))
        report.ok(table.name)
        return
    equal = _decode(table, fill.get("equal") or {})
    where = [table.c[k] == v for k, v in pk.items()]
    where += [table.c[c].is_(None) for c in fill["null"]]
    where += [table.c[k] == v for k, v in equal.items()]
    result = await db.execute(
        update(table).where(*where).values(**{c: row[c] for c in fill["cols"]})
    )
    if rowcount(result):
        report.ok(table.name)
    else:
        report.skip(table.name, ref, "changed_since")


async def restore(
    db: AsyncSession, request: Request, teacher: Teacher, group_id: uuid.UUID
) -> RestoreReport:
    """Put back the group's rows that are missing, parents first; never update a live row except to undo the delete's own in-place clear or version promotion."""
    items = await group_items(db, teacher, group_id)
    docs = [(_decode_doc(item.payload)) for item in items]
    tables = {name for doc in docs for name in doc.get("rows", {})}
    tables |= {f["table"] for doc in docs for f in doc.get("fills", [])}
    if tables & RESULT_TABLES:
        await require_server_results_writable(teacher)
    report = RestoreReport()
    versions: dict[uuid.UUID, int | None] = {}
    for name in TABLE_ORDER:
        table = _table(name)
        for doc in docs:
            meta = doc.get("meta", {})
            for raw in doc.get("rows", {}).get(name, []):
                await _restore_row(db, table, _decode(table, raw), meta, report, versions)
    for doc in docs:
        for fill in doc.get("fills", []):
            await _apply_fill(db, fill, report)
    await db.flush()
    await purge(db, items)
    await audit_svc.log(db, request, teacher, "TRASH_RESTORED", group_id)
    return report


async def _still_referenced(db: AsyncSession, refs: set[str], leaving: set[uuid.UUID]) -> set[str]:
    live = set(await db.scalars(select(ScanSubmission.scan_path).where(ScanSubmission.scan_path.in_(refs))))
    others = await db.scalars(
        select(TrashItem.blob_refs).where(TrashItem.id.not_in(leaving)) if leaving else select(TrashItem.blob_refs)
    )
    kept = {ref for refs_of in others for ref in (refs_of or [])}
    return {r for r in refs if r in live or r in kept}


async def purge(db: AsyncSession, items: Sequence[TrashItem]) -> None:
    """Erase entries now; their scan files go after the commit unless a live row or another entry still points at them."""
    if not items:
        return
    ids = {item.id for item in items}
    refs = {ref for item in items for ref in (item.blob_refs or [])}
    if refs:
        await db.flush()
        for ref in refs - await _still_referenced(db, refs, ids):
            blob_store.delete_after_commit(db, ref)
    id_list = list(ids)
    for start in range(0, len(id_list), _CHUNK):
        await db.execute(delete(TrashItem).where(TrashItem.id.in_(id_list[start : start + _CHUNK])))


async def all_blob_refs(db: AsyncSession) -> set[str]:
    """Every scan file the trash still points at (the blob sweep keeps them)."""
    return {ref for refs in await db.scalars(select(TrashItem.blob_refs)) for ref in (refs or [])}
