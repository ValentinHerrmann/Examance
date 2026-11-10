"""Management CLI. Commands: `python -m app.cli --help` (from /app inside the container). Retention (`run-retention`) is invoked by external cron (systemd timer / Kubernetes CronJob), never by an in-process scheduler, which would duplicate work across workers."""
from __future__ import annotations

import asyncio
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import TYPE_CHECKING, TextIO

import click
from sqlalchemy import func, select, update
from sqlalchemy.exc import OperationalError, ProgrammingError

from app.cli_common import in_session, raise_schema_hint
from app.cli_maintenance import maintenance_group
from app.config import settings  # validates config at import

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.models.teacher import Teacher
    from app.services.blob_audit import BlobAudit


@click.group()
def cli() -> None:
    """Examance management commands."""


# Deploy workflows call `python -m app.cli maintenance ...` through the *running* (previous) image.
cli.add_command(maintenance_group)


def _with_teacher[T](email: str, action: Callable[[AsyncSession, Teacher], Awaitable[T]]) -> T:
    """Run *action* on the account with this address in one committed session, else fail."""
    from app.models.teacher import Teacher

    normalized_email = email.strip().lower()

    async def _run(db: AsyncSession) -> T:
        result = await db.execute(
            select(Teacher).where(func.lower(Teacher.email) == normalized_email)
        )
        teacher = result.scalar_one_or_none()
        if teacher is None:
            raise click.ClickException("No user found with this email.")
        return await action(db, teacher)

    return asyncio.run(in_session(_run))


@cli.command("send-password-reset")
@click.option("--email", required=True, help="User email.")
def send_password_reset(email: str) -> None:
    """Generate and email a password reset link for an existing user account."""
    from app.services.password_reset import create_and_send_reset_token

    normalized_email = email.strip().lower()

    async def _send(db: AsyncSession, teacher: Teacher) -> bool:
        _raw_token, sent = await create_and_send_reset_token(db, teacher)
        return sent

    if _with_teacher(email, _send):
        click.echo(f"Password reset link generated and sent to: {normalized_email}")
    else:
        click.echo(
            f"Password reset token generated, but failed to send email to: {normalized_email}"
        )


@cli.command("approve-user")
@click.option("--email", required=True, help="User email.")
def approve_user(email: str) -> None:
    """Approve a pending account (recovery path when no admin can sign in to do it). Keeps the account's feature switches as they are."""

    async def _approve(db: AsyncSession, teacher: Teacher) -> str:  # NOSONAR: _with_teacher awaits its callback
        if teacher.approved_at is not None:
            return f"Already approved: {teacher.email}"
        teacher.approved_at = datetime.now(UTC)
        teacher.registration_note = None
        return f"Approved: {teacher.email}"

    click.echo(_with_teacher(email, _approve))


@cli.command("create-user")
@click.option("--email", required=True, help="User email.")
@click.option(
    "--role",
    type=click.Choice(["teacher", "admin"], case_sensitive=True),
    default="teacher",
    show_default=True,
    help="User role.",
)
@click.option(
    "--allow-admin",
    is_flag=True,
    default=False,
    help="Required when creating an admin account.",
)
@click.option(
    "--password",
    prompt=True,
    hide_input=True,
    confirmation_prompt=True,
    help="User password (min length: 12).",
)
def create_user(email: str, role: str, allow_admin: bool, password: str) -> None:
    """Create a teacher/admin account directly from CLI (for bootstrap and recovery)."""
    from app.models.teacher import Teacher
    from app.services.crypto import hash_password

    if len(password) < 12:
        raise click.ClickException("Password must be at least 12 characters long.")
    if role == "admin" and not allow_admin:
        raise click.ClickException("Refusing to create admin without --allow-admin.")

    typed_role = role if role == "admin" else "teacher"
    normalized_email = email.strip().lower()

    async def _insert(db: AsyncSession) -> str:
        existing = await db.execute(
            select(Teacher).where(func.lower(Teacher.email) == normalized_email)
        )
        if existing.scalar_one_or_none() is not None:
            raise click.ClickException("A user with this email already exists.")

        teacher = Teacher(
            email=normalized_email,
            password_hash=hash_password(password),
            role=typed_role,
            approved_at=datetime.now(UTC),
        )
        db.add(teacher)
        await db.flush()
        await db.refresh(teacher)
        return f"Created user: {teacher.email} ({teacher.role}) id={teacher.id}"

    click.echo(asyncio.run(in_session(_insert)))


@cli.command("set-role")
@click.option("--email", required=True, help="User email.")
@click.option(
    "--role",
    type=click.Choice(["teacher", "admin"], case_sensitive=True),
    required=True,
    help="New role.",
)
@click.option(
    "--force",
    is_flag=True,
    default=False,
    help="Make an account that owns exams or exercises an admin anyway.",
)
def set_role(email: str, role: str, force: bool) -> None:
    """Change an account's role; admins manage users and the server only (issue #58). An admin's own exams and exercises are kept but unreachable until it is a teacher again. Signs the account out everywhere, so every browser picks up the new role."""
    from fastapi import HTTPException

    from app.models.exam import Exam
    from app.models.exercise import Exercise
    from app.models.refresh_token import RefreshToken
    from app.services.account_deletion import ensure_not_last_admin

    async def _update(db: AsyncSession, teacher: Teacher) -> str:
        if teacher.role == role:
            return f"Unchanged: {teacher.email} is already {role}."

        if role == "teacher":
            try:
                await ensure_not_last_admin(db, teacher)
            except HTTPException:
                raise click.ClickException(
                    "Refusing to demote the last approved admin: nobody could approve "
                    "or manage accounts afterwards. Make another account an admin first."
                ) from None
        else:
            exams = await db.scalar(
                select(func.count())
                .select_from(Exam)
                .where(Exam.teacher_id == teacher.id, Exam.deleted_at.is_(None))
            )
            exercises = await db.scalar(
                select(func.count())
                .select_from(Exercise)
                .where(Exercise.teacher_id == teacher.id, Exercise.is_current.is_(True))
            )
            if (exams or exercises) and not force:
                raise click.ClickException(
                    f"{teacher.email} owns {exams or 0} exam(s) and {exercises or 0} "
                    "exercise(s). Admin accounts cannot open exams or exercises, so this "
                    "data stays stored but inaccessible while the account is an admin "
                    "(set the role back to teacher to reach it again). Re-run with "
                    "--force to proceed anyway."
                )

        teacher.role = role
        await db.execute(
            update(RefreshToken).where(RefreshToken.teacher_id == teacher.id).values(revoked=True)
        )
        return f"{teacher.email} is now {role}; their sessions were signed out."

    click.echo(_with_teacher(email, _update))


@cli.command("set-password")
@click.option("--email", required=True, help="Existing user email.")
@click.option(
    "--password",
    prompt=True,
    hide_input=True,
    confirmation_prompt=True,
    help="New password (min length: 12).",
)
def set_password(email: str, password: str) -> None:
    """Reset password for an existing user account."""
    from app.services.crypto import hash_password
    from app.services.key_envelope import invalidate_password_wrap

    if len(password) < 12:
        raise click.ClickException("Password must be at least 12 characters long.")

    normalized_email = email.strip().lower()

    async def _update(db: AsyncSession, teacher: Teacher) -> None:
        teacher.password_hash = hash_password(password)
        # The server never sees the data key, so it cannot re-wrap it: a stale password wrap sends the teacher to the recovery code, not into a vault of blank fields.
        await invalidate_password_wrap(db, teacher.id)

    _with_teacher(email, _update)
    click.echo(f"Password updated for user: {normalized_email}")
    click.echo(
        "Note: this does not restore access to the account's encrypted data. "
        "The user must sign in and recover their key with their recovery code."
    )


@cli.command("run-retention")
@click.option("--dry-run", is_flag=True, default=False, help="Print actions without DB writes.")
def run_retention(dry_run: bool) -> None:
    """Apply the retention policy (GDPR Art. 5(1)(e)): soft-delete, then hard-delete after grace. Idempotent; run it from EXTERNAL cron, not in-process. It is the ONLY thing that erases expired student data and audit entries: if it is not scheduled, nothing is ever deleted."""
    from app.services.retention import run as _run

    try:
        count = asyncio.run(_run(dry_run=dry_run))
    except (OperationalError, ProgrammingError) as exc:
        raise_schema_hint(exc)

    if dry_run:
        click.echo(
            f"[dry-run] Would affect {count} record(s) across exams, "
            "student data and audit entries."
        )
    else:
        click.echo(f"Retention run complete: {count} record(s) affected.")


@cli.command("poll-bounces")
def poll_bounces() -> None:
    """Read the dedicated result mailbox once (issue #221): update result-mail statuses, forward late bounces to the teacher and unmatched mail to SMTP_FROM_EMAIL, then empty it. Run it from external cron; without a bounce mailbox it does nothing."""
    from app.services.bounces import poll_bounces as _poll
    from app.services.capabilities import result_mailbox_configured

    if not result_mailbox_configured():
        click.echo("No result mailbox configured; nothing to do.")
        return
    try:
        ran = asyncio.run(in_session(_poll))
    except (OperationalError, ProgrammingError) as exc:
        raise_schema_hint(exc)
    click.echo("Result mailbox read." if ran else "Result mailbox not read (busy or unreachable).")


@cli.command("init-blob-store")
@click.option("--force", is_flag=True, default=False, help="Accept a non-empty directory.")
@click.option(
    "--rebind-from",
    default=None,
    metavar="OLD_FRONTEND_URL",
    help="After a domain move: re-mark a store that names this old address (docs/domain_move.md).",
)
def init_blob_store(force: bool, rebind_from: str | None) -> None:
    """Mark BLOB_STORAGE_DIR as this stack's file partition (docs/dev/storage_partitions.md). Run once, with the mount up. Without the marker every scan read/write fails instead of silently landing on the local disk under a dropped mount."""
    from app.services import blob_store

    try:
        path = blob_store.rebind(rebind_from) if rebind_from else blob_store.init(force=force)
    except blob_store.BlobStoreUnavailable as exc:
        raise click.ClickException(exc.reason) from None
    click.echo(f"Blob store ready: {path}")


def _echo_exam_findings(report: BlobAudit) -> None:
    for exam_key, exam in sorted(report.exams.items(), key=lambda item: str(item[0])):
        if exam.missing or exam.no_scan:
            click.echo(f"exam {exam_key}: {exam.live} live, {len(exam.missing)} file missing, {exam.no_scan} without scan")
            for sub_id in exam.missing:
                click.echo(f"  missing: submission {sub_id}")


def _echo_blob_report(report: BlobAudit, forget_missing: bool, yes: bool) -> None:
    click.echo(f"Store: {report.store or 'none configured (scans in the database)'}")
    _echo_exam_findings(report)
    if report.unchecked_paths:
        click.echo(f"{report.unchecked_paths} row(s) name a file, but no file store is configured.")
    click.echo(f"Files no live row names: {report.held_by_trash} held by the trash, {report.unreferenced} unreferenced (the sweep removes these).")
    missing = len(report.missing_ids)
    if forget_missing:
        verb = "Cleared" if yes else "Would clear (pass --yes)"
        click.echo(f"{verb} the file reference of {missing} row(s); rows, scores and files stay.")


@cli.command("check-blobs")
@click.option("--forget-missing", is_flag=True, default=False, help="Clear the file reference of live rows whose file is missing.")
@click.option("--yes", is_flag=True, default=False, help="Apply --forget-missing; without it, only show what would change.")
@click.option("--exam", "exam_id", type=click.UUID, default=None, help="Check only this exam's rows.")
def check_blobs(forget_missing: bool, yes: bool, exam_id: uuid.UUID | None) -> None:
    """Compare scan rows with the file store (docs/dev/storage_partitions.md): ids and counts only. Exit code 1 when a live row's scan cannot be read. Run after a restore, rebind or storage move."""
    from app.services import blob_audit, blob_store

    async def _run(db: AsyncSession) -> blob_audit.BlobAudit:
        report = await blob_audit.audit(db, exam_id)
        if forget_missing and yes:
            await blob_audit.forget_missing(db, report)
        return report

    try:
        report = asyncio.run(in_session(_run))
    except blob_store.BlobStoreUnavailable as exc:
        raise click.ClickException(exc.reason) from None
    _echo_blob_report(report, forget_missing, yes)
    if report.broken and not (forget_missing and yes and not report.unchecked_paths):
        raise SystemExit(1)


@cli.command("move-blobs")
@click.option("--to", "target", type=click.Choice(["fs", "db"]), required=True)
def move_blobs(target: str) -> None:
    """Move every scan into the file partition or back into the database; verified, resumable. Set BLOB_STORAGE_BACKEND to the same target first, or new uploads land on the other side."""
    from sqlalchemy import create_engine

    from app.services import blob_store
    from app.services.blob_migration import move_scans

    if settings.BLOB_STORAGE_BACKEND != target:
        click.echo(f"Warning: BLOB_STORAGE_BACKEND is {settings.BLOB_STORAGE_BACKEND!r}.", err=True)
    engine = create_engine(settings.DATABASE_URL_SYNC, isolation_level="AUTOCOMMIT")
    try:
        with engine.connect() as conn:
            moved = move_scans(conn, target)  # type: ignore[arg-type]
    except blob_store.BlobStoreUnavailable as exc:
        raise click.ClickException(exc.reason) from None
    finally:
        engine.dispose()
    click.echo(f"Moved {moved} scan(s) to {target}.")


@cli.command("training-export")
@click.option(
    "--out",
    "out_path",
    required=True,
    type=click.Path(dir_okay=False, writable=True),
    help="Output JSON Lines file (one donated sample per line).",
)
@click.option(
    "--since",
    type=click.DateTime(formats=["%Y-%m-%d"]),
    default=None,
    help="Only samples donated on or after this date (YYYY-MM-DD).",
)
def training_export(out_path: str, since: datetime | None) -> None:
    """Export donated OMR training samples as JSON Lines for offline model training. Rows (label, versions, detector features, base64 grayscale crop) carry no identifiers by design: keep the export that way, no joins or enrichment."""
    import base64
    import json

    from app.database import AsyncSessionLocal
    from app.models.omr_training_sample import OmrTrainingSample

    # The sync CLI owns the file; the coroutine only streams rows into it.
    async def _export(fh: TextIO) -> int:
        count = 0
        async with AsyncSessionLocal() as db:
            query = select(OmrTrainingSample).order_by(OmrTrainingSample.created_on)
            if since is not None:
                query = query.where(OmrTrainingSample.created_on >= since.date())
            result = await db.stream_scalars(query)
            async for row in result:
                fh.write(
                    json.dumps(
                        {
                            "id": str(row.id),
                            "created_on": row.created_on.isoformat(),
                            "schema_version": row.schema_version,
                            "algorithm_version": row.algorithm_version,
                            "label_selected": row.label_selected,
                            "crop_width": row.crop_width,
                            "crop_height": row.crop_height,
                            "crop_b64": base64.b64encode(row.crop).decode("ascii"),
                            "meta": row.meta,
                        }
                    )
                    + "\n"
                )
                count += 1
        return count

    try:
        with open(out_path, "w", encoding="utf-8") as fh:
            count = asyncio.run(_export(fh))
    except (OperationalError, ProgrammingError) as exc:
        raise_schema_hint(exc)
    click.echo(f"Exported {count} training sample(s) to {out_path}.")


@cli.command("export-openapi")
@click.option(
    "--output",
    "-o",
    default="docs/openapi.json",
    show_default=True,
    help="Output JSON file path.",
)
def export_openapi(output: str) -> None:
    """Export static OpenAPI 3.0 specification as JSON."""
    import json
    from pathlib import Path

    from app.main import create_app

    app = create_app()
    openapi_schema = app.openapi()

    out_path = Path(output)
    if not out_path.is_absolute():
        repo_root = Path(__file__).resolve().parent.parent.parent
        out_path = repo_root / output

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(openapi_schema, indent=2) + "\n", encoding="utf-8")
    click.echo(f"Exported OpenAPI specification to {out_path}")


if __name__ == "__main__":
    cli()
