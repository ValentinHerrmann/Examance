"""
Management CLI commands.

Usage (from /app directory inside container):
    python -m app.cli create-invite [--expires-days 7]
    python -m app.cli run-retention [--dry-run]

Invoked by external cron (systemd timer / Kubernetes CronJob).
NOT by an in-process scheduler — avoids multi-worker duplication.
"""
from __future__ import annotations

import asyncio
from typing import NoReturn

import click
from sqlalchemy import func, select
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
                )
                db.add(teacher)
                await db.commit()
                await db.refresh(teacher)
                return teacher
            except (OperationalError, ProgrammingError) as exc:
                _raise_schema_hint(exc)

    created = asyncio.run(_insert())
    click.echo(f"Created user: {created.email} ({created.role}) id={created.id}")


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
                await db.commit()
            except (OperationalError, ProgrammingError) as exc:
                _raise_schema_hint(exc)

    asyncio.run(_update())
    click.echo(f"Password updated for user: {normalized_email}")


@cli.command("run-retention")
@click.option("--dry-run", is_flag=True, default=False, help="Print actions without DB writes.")
def run_retention(dry_run: bool) -> None:
    """
    Apply the retention policy (GDPR Art. 5(1)(e)).

    Soft-deletes exams past retention_until and stamps their student identities
    and submissions for erasure; hard-deletes those whose grace period has
    elapsed; removes audit entries past their retention period.

    Designed to be called by an EXTERNAL cron job (not in-process scheduler).
    Safe to run multiple times — idempotent (already deleted rows are skipped).

    This job is the ONLY thing that erases expired student data. If it is not
    scheduled, nothing is ever deleted.
    """
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
