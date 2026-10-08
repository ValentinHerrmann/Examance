"""exam topic

Adds exams.topic: an optional free-text topic for organising exams (issue #57). Unlike fach and
klasse it is never printed on the exam.

Revision ID: 0033_exam_topic
Revises: 0032_sharing_audit_split
Create Date: 2026-10-07
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0033_exam_topic"
down_revision = "0032_sharing_audit_split"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("exams", sa.Column("topic", sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column("exams", "topic")
