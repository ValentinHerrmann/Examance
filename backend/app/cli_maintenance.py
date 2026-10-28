"""Maintenance-window commands of the management CLI (`python -m app.cli maintenance ...`).

Registered on the `cli` group by `app.cli`. Deploy workflows call these through the *running*
(previous) image: keep names and options stable, or the next deploy runs without maintenance
(docs/deployment.md)."""
from __future__ import annotations

import asyncio
import sys
from typing import TYPE_CHECKING

import click

from app.cli_common import in_session

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.services.maintenance import WindowState


@click.group("maintenance")
def maintenance_group() -> None:
    """Announce, freeze and end maintenance windows (issue #130)."""


async def _load_window(db: AsyncSession) -> WindowState | None:
    from app.services import maintenance

    return await maintenance.load(db, fresh=True)


@maintenance_group.command("start")
@click.option("--kind", type=click.Choice(["deployment", "manual"]), default="deployment")
@click.option("--lead-seconds", type=click.IntRange(min=0), default=300, show_default=True)
@click.option("--second-warning-seconds", type=click.IntRange(min=0), default=60, show_default=True)
@click.option(
    "--class",
    "downtime_class",
    type=click.Choice(["very_short", "short", "long", "unspecific"]),
    default="very_short",
    show_default=True,
)
@click.option("--backup/--no-backup", default=True, help="Manual windows only; deployments always.")
@click.option(
    "--wait-free",
    type=click.IntRange(min=0),
    default=0,
    help="Wait up to N s for an open manual or frozen window to end; then exit 75.",
)
def maintenance_start(
    kind: str,
    lead_seconds: int,
    second_warning_seconds: int,
    downtime_class: str,
    backup: bool,
    wait_free: int,
) -> None:
    """Announce a window; prints its revision (pass it to freeze/wait-backup/stop)."""
    import time

    from app.services import maintenance

    async def _start(db: AsyncSession) -> WindowState:
        return await maintenance.start(
            db,
            kind=kind,  # type: ignore[arg-type]
            downtime_class=downtime_class,  # type: ignore[arg-type]
            lead_seconds=lead_seconds,
            second_warning_seconds=second_warning_seconds,
            backup=backup,
        )

    deadline = time.monotonic() + wait_free
    while True:
        try:
            state = asyncio.run(in_session(_start))
            break
        except maintenance.WindowBusyError:
            if time.monotonic() >= deadline:
                click.echo("Another maintenance window is still open; not announcing.", err=True)
                # 75 (EX_TEMPFAIL): CI tells "busy" apart from "no CLI / no stack".
                sys.exit(75)
            click.echo("Waiting for the open maintenance window to end.", err=True)
            time.sleep(10)
    click.echo(state.revision)


def _wait_for_announced_start(revision: int) -> None:
    """Sleep until the window's start, re-reading it: an admin may move it forward (issue #149)."""
    import time

    from app.services import maintenance

    deadline = time.monotonic() + 900
    announced = False
    while time.monotonic() < deadline:
        state = asyncio.run(in_session(_load_window))
        now = maintenance.now_utc()
        if state is None or state.revision != revision or state.phase(now) == "none":
            return
        remaining = (state.starts_at - now).total_seconds()
        if remaining <= 0:
            return
        if not announced:
            click.echo(f"Waiting {remaining:.0f}s for the announced start.")
            announced = True
        time.sleep(min(remaining, 5, max(0.0, deadline - time.monotonic())))


@maintenance_group.command("freeze")
@click.option("--revision", type=int, required=True)
@click.option("--wait", is_flag=True, help="First wait for the announced start (at most 15 min).")
def maintenance_freeze(revision: int, wait: bool) -> None:
    """Deployment: stop teaching writes, so the backup is consistent."""
    from app.services import maintenance

    async def _freeze(db: AsyncSession) -> bool:
        return await maintenance.freeze(db, revision)

    if wait:
        _wait_for_announced_start(revision)

    if not asyncio.run(in_session(_freeze)):
        raise click.ClickException(f"Window {revision} is not open (ended, expired or replaced).")
    click.echo(f"Window {revision} frozen.")


@maintenance_group.command("wait-backup")
@click.option("--revision", type=int, required=True)
@click.option("--timeout", "timeout_seconds", type=click.IntRange(min=1), default=900)
def maintenance_wait_backup(revision: int, timeout_seconds: int) -> None:
    """Wait for the maintenance-backup service; fails on a failed backup or timeout."""
    import time

    from app.services import maintenance

    deadline = time.monotonic() + timeout_seconds
    while True:
        state = asyncio.run(in_session(_load_window))
        if state is None or state.revision != revision:
            raise click.ClickException(f"Window {revision} was replaced or never started.")
        if state.phase(maintenance.now_utc()) != "down":
            raise click.ClickException(f"Window {revision} is no longer frozen (ended or expired).")
        if state.backup_state == "done":
            click.echo(f"Backup done: {state.backup_file}")
            return
        if state.backup_state == "failed":
            raise click.ClickException("Maintenance backup failed; see the maintenance-backup log.")
        if time.monotonic() > deadline:
            raise click.ClickException(
                "No maintenance backup in time. Is the maintenance-backup service running?"
            )
        time.sleep(2)


@maintenance_group.command("stop")
@click.option("--revision", type=int, default=None, help="Only end this window.")
def maintenance_stop(revision: int | None) -> None:
    """End the open window (no-op if it is already over or was replaced)."""
    from app.services import maintenance

    async def _end(db: AsyncSession) -> bool:
        return await maintenance.end(db, revision)

    ended = asyncio.run(in_session(_end))
    click.echo("Window ended." if ended else "No matching open window.")


@maintenance_group.command("status")
def maintenance_status() -> None:
    """Show the current window and its phase."""
    from app.services import maintenance

    state = asyncio.run(in_session(_load_window))
    if state is None:
        click.echo("No maintenance window.")
        return
    click.echo(
        f"revision={state.revision} kind={state.kind} phase={state.phase(maintenance.now_utc())} "
        f"starts_at={state.starts_at.isoformat()} backup={state.backup_state or '-'} "
        f"offsite={state.offsite_state or '-'}"
    )
