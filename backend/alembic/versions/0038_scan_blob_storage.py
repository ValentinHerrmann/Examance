"""scan blob storage (#114): with BLOB_STORAGE_BACKEND=fs, move scans out of Postgres into files

Revision ID: 0038_scan_blob_storage
Revises: 0037_duplicate_audit
Create Date: 2026-10-20
"""
from __future__ import annotations

from sqlalchemy import text

from alembic import op
from app.config import settings
from app.services.blob_migration import move_scans

# revision identifiers, used by Alembic.
revision = "0038_scan_blob_storage"
down_revision = "0037_duplicate_audit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Data only (scan_path exists since 0001). Each row commits on its own, so a failed run keeps
    # its progress and the next `alembic upgrade` resumes. Later switches: `cli.py move-blobs`.
    if settings.BLOB_STORAGE_BACKEND != "fs":
        return
    with op.get_context().autocommit_block():
        moved = move_scans(op.get_bind(), "fs")
    # alembic.ini configures no logging; the deploy log should still show what moved.
    print(f"0038: moved {moved} scan(s) into {settings.BLOB_STORAGE_DIR}")


def downgrade() -> None:
    # Older code reads only scan_ciphertext: every file comes back into the DB, or downgrade fails.
    if op.get_bind().execute(
        text("SELECT 1 FROM scan_submissions WHERE scan_path IS NOT NULL LIMIT 1")
    ).first() is None:
        return
    with op.get_context().autocommit_block():
        moved = move_scans(op.get_bind(), "db")
    print(f"0038 downgrade: moved {moved} scan(s) back into the database")
