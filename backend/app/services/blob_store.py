"""File partition for large blobs (scans today): a local dir or an rclone mount (issue #114).

Layout `<BLOB_STORAGE_DIR>/<kind>/<group>/<name>-<token>.bin`; the DB stores the relative ref.
Background and invariants: `docs/dev/storage_partitions.md`."""
from __future__ import annotations

import json
import logging
import os
import secrets
import shutil
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import anyio
from fastapi import HTTPException, status
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.config import settings

logger = logging.getLogger(__name__)

SENTINEL = ".examance-blobstore"
# Files younger than this are never swept: their row may not be committed yet.
SWEEP_MIN_AGE_SECONDS = 3600
_TMP_SUFFIX = ".tmp"
_PENDING_DELETES = "blob_pending_deletes"
_WRITTEN = "blob_written"


class BlobStoreUnavailable(HTTPException):
    def __init__(self, reason: str) -> None:
        super().__init__(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ERR_BLOB_STORE_UNAVAILABLE",
        )
        self.reason = reason


def _identity() -> str:
    # Binds a directory to one stack: preview and production must never sweep each other.
    return settings.FRONTEND_URL.rstrip("/")


def configured() -> bool:
    return bool(settings.BLOB_STORAGE_DIR)


def writes_to_files() -> bool:
    return settings.BLOB_STORAGE_BACKEND == "fs"


def root() -> Path:
    """The verified root. Never falls back to a bare directory: a dropped mount must fail, not
    silently fill the local disk underneath it."""
    if not settings.BLOB_STORAGE_DIR:
        raise BlobStoreUnavailable("BLOB_STORAGE_DIR is not set")
    base = Path(settings.BLOB_STORAGE_DIR)
    try:
        data = json.loads((base / SENTINEL).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise BlobStoreUnavailable(
            f"{base / SENTINEL} missing or unreadable (mount down, or run `cli.py init-blob-store`)"
        ) from None
    if data.get("identity") != _identity():
        raise BlobStoreUnavailable(
            f"{base} belongs to {data.get('identity')!r}, not {_identity()!r}"
        )
    return base


def init(*, force: bool = False) -> Path:
    """Mark BLOB_STORAGE_DIR as this stack's store; a non-empty unmarked dir needs *force*."""
    if not settings.BLOB_STORAGE_DIR:
        raise BlobStoreUnavailable("BLOB_STORAGE_DIR is not set")
    base = Path(settings.BLOB_STORAGE_DIR)
    sentinel = base / SENTINEL
    if sentinel.exists():
        root()  # Re-validates identity.
        return base
    if not base.is_dir():
        raise BlobStoreUnavailable(f"{base} does not exist (is the mount up?)")
    if any(base.iterdir()) and not force:
        raise BlobStoreUnavailable(f"{base} is not empty; pass --force if it is the right dir")
    sentinel.write_text(json.dumps({"identity": _identity()}), encoding="utf-8")
    return base


def _resolve(ref: str) -> Path:
    base = root()
    path = (base / ref).resolve()
    if base.resolve() not in path.parents:
        raise ValueError(f"blob ref escapes the store: {ref!r}")
    return path


def put_sync(kind: str, group: str, name: str, data: bytes) -> str:
    """Write atomically, read back the size, return the new ref. Every write gets a fresh file,
    so a committed row never points at a half-replaced one."""
    ref = f"{kind}/{group}/{name}-{secrets.token_hex(4)}.bin"
    path = _resolve(ref)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + _TMP_SUFFIX)
    with open(tmp, "wb") as fh:
        fh.write(data)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)
    if path.stat().st_size != len(data):
        path.unlink(missing_ok=True)
        raise BlobStoreUnavailable(f"short write for {ref}")
    return ref


def get_sync(ref: str) -> bytes:
    try:
        return _resolve(ref).read_bytes()
    except FileNotFoundError:
        logger.error("blob %s referenced by the DB is missing", ref)
        raise BlobStoreUnavailable(f"missing blob {ref}") from None


def delete_sync(ref: str) -> None:
    _resolve(ref).unlink(missing_ok=True)


def delete_group_sync(kind: str, group: str) -> None:
    shutil.rmtree(_resolve(f"{kind}/{group}"), ignore_errors=True)


async def put(kind: str, group: str, name: str, data: bytes) -> str:
    return await anyio.to_thread.run_sync(put_sync, kind, group, name, data)


async def get(ref: str) -> bytes:
    return await anyio.to_thread.run_sync(get_sync, ref)


def iter_refs(kind: str) -> Iterator[tuple[str, float]]:
    """(ref, mtime) of every file under *kind*, temp files included."""
    base = root()
    for path in (base / kind).rglob("*"):
        if path.is_file():
            yield path.relative_to(base).as_posix(), path.stat().st_mtime


def sweep_sync(kind: str, referenced: set[str]) -> int:
    """Delete files no row references (crash leftovers, replaced or cascaded scans)."""
    cutoff = time.time() - SWEEP_MIN_AGE_SECONDS
    removed = 0
    for ref, mtime in list(iter_refs(kind)):
        if ref not in referenced and mtime < cutoff:
            delete_sync(ref)
            removed += 1
    return removed


# Deletions wait for the commit (a rollback keeps the old file); new files die with a rollback.
def remember_written(session: Any, ref: str) -> None:
    session.info.setdefault(_WRITTEN, []).append(ref)


def delete_after_commit(session: Any, ref: str) -> None:
    session.info.setdefault(_PENDING_DELETES, []).append(("ref", ref))


def delete_group_after_commit(session: Any, kind: str, group: str) -> None:
    session.info.setdefault(_PENDING_DELETES, []).append(("group", f"{kind}/{group}"))


def _apply(ops: list[tuple[str, str]]) -> None:
    # Never raises: the commit has happened; a failed delete is left to the retention sweep.
    for op, target in ops:
        try:
            if op == "ref":
                delete_sync(target)
            else:
                kind, group = target.split("/", 1)
                delete_group_sync(kind, group)
        except Exception:
            logger.warning("blob cleanup of %s failed; the retention sweep retries", target)


@event.listens_for(Session, "after_commit")
def _after_commit(session: Session) -> None:
    session.info.pop(_WRITTEN, None)
    if configured():
        _apply(session.info.pop(_PENDING_DELETES, []))


@event.listens_for(Session, "after_rollback")
def _after_rollback(session: Session) -> None:
    session.info.pop(_PENDING_DELETES, None)
    written = session.info.pop(_WRITTEN, [])
    if configured():
        _apply([("ref", ref) for ref in written])
