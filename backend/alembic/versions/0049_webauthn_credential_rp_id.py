"""Record the RP ID (domain) each passkey was made for, for the domain move (issue #198)

Revision ID: 0049_webauthn_credential_rp_id
Revises: 0048_exam_pseudonym_version
Create Date: 2026-11-01
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "0049_webauthn_credential_rp_id"
down_revision = "0048_exam_pseudonym_version"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable without backfill: the migration cannot know the old domain, a passkey's next sign-in records it.
    op.add_column("webauthn_credentials", sa.Column("rp_id", sa.String(253), nullable=True))


def downgrade() -> None:
    op.drop_column("webauthn_credentials", "rp_id")
