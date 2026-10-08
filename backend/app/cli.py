"""Management CLI. Commands: `python -m app.cli --help` (from /app inside the container).

Retention (`run-retention`) is invoked by external cron (systemd timer / Kubernetes CronJob),
never by an in-process scheduler, which would duplicate work across workers."""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import NoReturn

import click
from sqlalchemy import func, select, update
from sqlalchemy.exc import OperationalError, ProgrammingError

from app.config import settings  # noqa: F401 — validates config at import


@click.group()
def cli() -> None:
    """Examance management commands."""


def _raise_schema_hint(exc: Exception) -> NoReturn:
    """Convert DB schema errors into actionable CLI guidance."""
    msg = str(exc).lower()
    if "no such table" in msg or "undefined table" in msg:
        raise click.ClickException(
            "Database schema is not initialized for the current DATABASE_URL.\n"
            f"Current DATABASE_URL: {settings.DATABASE_URL}\n"
            "Run migrations first, then retry:\n"
            "  docker compose up -d db redis backend\n"
            "  docker compose exec backend alembic upgrade head\n"
            "If you intentionally use local SQLite, run Alembic with matching env vars."
        )
    raise click.ClickException(f"Database operation failed: {exc}")


@cli.command("send-password-reset")
@click.option("--email", required=True, help="User email.")
def send_password_reset(email: str) -> None:
    """Generate and email a password reset link for an existing user account."""
    from app.models.teacher import Teacher
    from app.services.password_reset import create_and_send_reset_token

    normalized_email = email.strip().lower()

    async def _send() -> None:
        from app.database import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            try:
                result = await db.execute(
                    select(Teacher).where(func.lower(Teacher.email) == normalized_email)
                )
                teacher = result.scalar_one_or_none()
                if teacher is None:
                    raise click.ClickException("No user found with this email.")

                _raw_token, sent = await create_and_send_reset_token(db, teacher)
                await db.commit()
                if sent:
                    click.echo(f"Password reset link generated and sent to: {normalized_email}")
                else:
                    click.echo(
                        "Password reset token generated, but failed to send email to: "
                        f"{normalized_email}"
                    )
            except (OperationalError, ProgrammingError) as exc:
                _raise_schema_hint(exc)

    asyncio.run(_send())


@cli.command("approve-user")
@click.option("--email", required=True, help="User email.")
def approve_user(email: str) -> None:
    """
    Approve a pending account (recovery path when no admin can sign in to do it).

    Keeps the account's feature switches as they are.
    """
    from app.models.teacher import Teacher

    normalized_email = email.strip().lower()

    async def _approve() -> str:
        from app.database import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            try:
                result = await db.execute(
                    select(Teacher).where(func.lower(Teacher.email) == normalized_email)
                )
                teacher = result.scalar_one_or_none()
                if teacher is None:
                    raise click.ClickException("No user found with this email.")
                if teacher.approved_at is not None:
                    return f"Already approved: {teacher.email}"
                teacher.approved_at = datetime.now(UTC)
                teacher.registration_note = None
                await db.commit()
                return f"Approved: {teacher.email}"
            except (OperationalError, ProgrammingError) as exc:
                _raise_schema_hint(exc)

    click.echo(asyncio.run(_approve()))


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

    async def _insert() -> Teacher:
        from app.database import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            try:
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
                await db.commit()
                await db.refresh(teacher)
                return teacher
            except (OperationalError, ProgrammingError) as exc:
                _raise_schema_hint(exc)

    created = asyncio.run(_insert())
    click.echo(f"Created user: {created.email} ({created.role}) id={created.id}")


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
    """Change an account's role; admins manage users and the server only (issue #58).

    An admin's own exams and exercises are kept but unreachable until it is a teacher again.
    Signs the account out everywhere, so every browser picks up the new role."""
    from app.models.exam import Exam
    from app.models.exercise import Exercise
    from app.models.refresh_token import RefreshToken
    from app.models.teacher import Teacher

    normalized_email = email.strip().lower()

    async def _update() -> str:
        from app.database import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            try:
                result = await db.execute(
                    select(Teacher).where(func.lower(Teacher.email) == normalized_email)
                )
                teacher = result.scalar_one_or_none()
                if teacher is None:
                    raise click.ClickException("No user found with this email.")
                if teacher.role == role:
                    return f"Unchanged: {teacher.email} is already {role}."

                if role == "teacher":
                    # Locks the admin rows, like ensure_not_last_admin, so two demotions can't race.
                    admins = (
                        await db.scalars(
                            select(Teacher.id)
                            .where(Teacher.role == "admin", Teacher.approved_at.isnot(None))
                            .with_for_update()
                        )
                    ).all()
                    if not [admin_id for admin_id in admins if admin_id != teacher.id]:
                        raise click.ClickException(
                            "Refusing to demote the last approved admin: nobody could approve "
                            "or manage accounts afterwards. Make another account an admin first."
                        )
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
                    update(RefreshToken)
                    .where(RefreshToken.teacher_id == teacher.id)
                    .values(revoked=True)
                )
                await db.commit()
                return f"{teacher.email} is now {role}; their sessions were signed out."
            except (OperationalError, ProgrammingError) as exc:
                _raise_schema_hint(exc)

    click.echo(asyncio.run(_update()))


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
    from app.models.teacher import Teacher
    from app.services.crypto import hash_password
    from app.services.key_envelope import invalidate_password_wrap

    if len(password) < 12:
        raise click.ClickException("Password must be at least 12 characters long.")

    normalized_email = email.strip().lower()

    async def _update() -> None:
        from app.database import AsyncSessionLocal

        async with AsyncSessionLocal() as db:
            try:
                result = await db.execute(
                    select(Teacher).where(func.lower(Teacher.email) == normalized_email)
                )
                teacher = result.scalar_one_or_none()
                if teacher is None:
                    raise click.ClickException("No user found with this email.")

                teacher.password_hash = hash_password(password)
                # The server never sees the data key, so it cannot re-wrap it: a stale password
                # wrap sends the teacher to the recovery code, not into a vault of blank fields.
                await invalidate_password_wrap(db, teacher.id)
                await db.commit()
            except (OperationalError, ProgrammingError) as exc:
                _raise_schema_hint(exc)

    asyncio.run(_update())
    click.echo(f"Password updated for user: {normalized_email}")
    click.echo(
        "Note: this does not restore access to the account's encrypted data. "
        "The user must sign in and recover their key with their recovery code."
    )


@cli.command("run-retention")
@click.option("--dry-run", is_flag=True, default=False, help="Print actions without DB writes.")
def run_retention(dry_run: bool) -> None:
    """Apply the retention policy (GDPR Art. 5(1)(e)): soft-delete, then hard-delete after grace.

    Idempotent; run it from EXTERNAL cron, not in-process. It is the ONLY thing that erases
    expired student data and audit entries: if it is not scheduled, nothing is ever deleted."""
    from app.services.retention import run as _run

    try:
        count = asyncio.run(_run(dry_run=dry_run))
    except (OperationalError, ProgrammingError) as exc:
        _raise_schema_hint(exc)

    if dry_run:
        click.echo(
            f"[dry-run] Would affect {count} record(s) across exams, "
            "student data and audit entries."
        )
    else:
        click.echo(f"Retention run complete: {count} record(s) affected.")


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
    """Export donated OMR training samples as JSON Lines for offline model training.

    Rows (label, versions, detector features, base64 grayscale crop) carry no identifiers by
    design: keep the export that way, no joins or enrichment."""
    import base64
    import json

    from app.database import AsyncSessionLocal
    from app.models.omr_training_sample import OmrTrainingSample

    async def _export() -> int:
        count = 0
        async with AsyncSessionLocal() as db:
            query = select(OmrTrainingSample).order_by(OmrTrainingSample.created_on)
            if since is not None:
                query = query.where(OmrTrainingSample.created_on >= since.date())
            result = await db.stream_scalars(query)
            with open(out_path, "w", encoding="utf-8") as fh:
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
        count = asyncio.run(_export())
    except (OperationalError, ProgrammingError) as exc:
        _raise_schema_hint(exc)
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
