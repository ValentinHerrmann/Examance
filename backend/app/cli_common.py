"""Helpers shared by `app.cli` and `app.cli_maintenance` (kept apart: `python -m app.cli` runs `app.cli` as `__main__`, so a module imported by it must not import it back)."""
from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, NoReturn

import click
from sqlalchemy.exc import OperationalError, ProgrammingError

from app.config import settings

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


def raise_schema_hint(exc: Exception) -> NoReturn:
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


async def in_session[T](action: Callable[[AsyncSession], Awaitable[T]]) -> T:
    """Run *action* in one session and commit; a missing schema becomes a CLI hint."""
    from app.database import AsyncSessionLocal, engine

    try:
        async with AsyncSessionLocal() as db:
            try:
                result = await action(db)
                await db.commit()
                return result
            except (OperationalError, ProgrammingError) as exc:
                raise_schema_hint(exc)
    finally:
        # Each command step is its own asyncio.run: pooled connections must not outlive their loop.
        await engine.dispose()
