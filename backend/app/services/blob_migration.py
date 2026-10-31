"""Move scans between the DB and the file partition, verified and resumable (issue #114). Runs on an AUTOCOMMIT sync connection (Alembic `autocommit_block` or the CLI): every row commits on its own, so an abort keeps all finished rows and a rerun only picks up what is left."""
from __future__ import annotations

import hashlib
import logging
from typing import Literal

from sqlalchemy import Connection, text

from app.services import blob_store

logger = logging.getLogger(__name__)

KIND = "scans"
BATCH = 50


def _digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _to_fs(conn: Connection) -> int:
    moved = 0
    while True:
        rows = conn.execute(
            text(
                "SELECT id, exam_id, scan_ciphertext FROM scan_submissions "
                "WHERE scan_ciphertext IS NOT NULL LIMIT :n"
            ),
            {"n": BATCH},
        ).all()
        if not rows:
            return moved
        for sub_id, exam_id, data in rows:
            data = bytes(data)
            ref = blob_store.put_sync(KIND, str(exam_id), str(sub_id), data)
            if _digest(blob_store.get_sync(ref)) != _digest(data):
                blob_store.delete_sync(ref)
                raise RuntimeError(f"verification failed for submission {sub_id}; nothing changed")
            # Conditional on the bytes we copied: a concurrent rewrite keeps its own copy.
            done = conn.execute(
                text(
                    "UPDATE scan_submissions SET scan_path = :ref, scan_ciphertext = NULL "
                    "WHERE id = :id AND scan_ciphertext = :data"
                ),
                {"ref": ref, "id": sub_id, "data": data},
            ).rowcount
            if done:
                moved += 1
            else:
                blob_store.delete_sync(ref)
        logger.info("moved %d scans to %s", moved, blob_store.root())


def _to_db(conn: Connection) -> int:
    moved = 0
    while True:
        rows = conn.execute(
            text(
                "SELECT id, scan_path FROM scan_submissions "
                "WHERE scan_path IS NOT NULL AND scan_ciphertext IS NULL LIMIT :n"
            ),
            {"n": BATCH},
        ).all()
        if not rows:
            return moved
        for sub_id, ref in rows:
            data = blob_store.get_sync(ref)
            # The file stays; the retention sweep removes it once no row references it.
            moved += conn.execute(
                text(
                    "UPDATE scan_submissions SET scan_ciphertext = :data, scan_path = NULL "
                    "WHERE id = :id AND scan_path = :ref AND scan_ciphertext IS NULL"
                ),
                {"data": data, "id": sub_id, "ref": ref},
            ).rowcount
        logger.info("moved %d scans into the database", moved)


def move_scans(conn: Connection, to: Literal["fs", "db"]) -> int:
    """Move every scan to *to*; fails before touching a row if the store is not mounted."""
    blob_store.root()
    return _to_fs(conn) if to == "fs" else _to_db(conn)
