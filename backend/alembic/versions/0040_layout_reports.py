"""layout reports (#134): teacher-shared LaTeX layout problems for the admins

Revision ID: 0040_layout_reports
Revises: 0039_maintenance_mode
Create Date: 2026-10-25
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0040_layout_reports"
down_revision = "0039_maintenance_mode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "layout_reports",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("reporter_id", sa.Uuid(), nullable=False),
        sa.Column("source_kind", sa.String(length=16), nullable=False),
        sa.Column("source_title", sa.String(length=255), nullable=False),
        sa.Column("engine", sa.String(length=16), nullable=False),
        sa.Column("app_version", sa.String(length=64), nullable=False),
        sa.Column("problem", sa.Text(), nullable=False),
        sa.Column("expected", sa.Text(), nullable=False),
        sa.Column("compile_error", sa.Text(), nullable=True),
        sa.Column("allow_publication", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("resolution_note", sa.String(length=1000), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["reporter_id"], ["teachers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_layout_reports_reporter_id", "layout_reports", ["reporter_id"])
    op.create_index("ix_layout_reports_status", "layout_reports", ["status"])
    op.create_index("ix_layout_reports_created_at", "layout_reports", ["created_at"])
    op.create_table(
        "layout_report_files",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("report_id", sa.Uuid(), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=150), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        sa.ForeignKeyConstraint(["report_id"], ["layout_reports.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_layout_report_files_report_id", "layout_report_files", ["report_id"])


def downgrade() -> None:
    op.drop_table("layout_report_files")
    op.drop_table("layout_reports")
