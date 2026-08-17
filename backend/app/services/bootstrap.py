"""Bootstrap service for application startup tasks."""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.teacher import Teacher
from app.services.crypto import hash_password, verify_password

logger = logging.getLogger(__name__)


async def create_initial_admin(db: AsyncSession) -> None:
    """
    Idempotent startup hook to create initial admin user if configured in .env
    and no matching user exists yet.
    """
    if not settings.INITIAL_ADMIN_EMAIL or not settings.INITIAL_ADMIN_PASSWORD:
        if settings.is_dev:
            logger.info(
                "INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD not set. "
                "Skipping initial admin creation."
            )
        else:
            logger.warning(
                "INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD not set in production. "
                "Skipping admin bootstrap."
            )
        return

    admin_email = settings.INITIAL_ADMIN_EMAIL.strip().lower()

    stmt = select(Teacher).where(Teacher.email == admin_email)
    res = await db.execute(stmt)
    existing_admin = res.scalar_one_or_none()

    if existing_admin:
        password_matches = (
            existing_admin.password_hash is not None
            and verify_password(settings.INITIAL_ADMIN_PASSWORD, existing_admin.password_hash)
        )
        role_matches = existing_admin.role == "admin"
        if not password_matches or not role_matches:
            logger.warning(
                "Initial admin user (%s) already exists, but credentials or role do not match "
                "INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD in .env "
                "(password_match=%s, role=%s). Bootstrap will NOT overwrite existing accounts. "
                "Use `python -m app.cli set-password --email %s` to update the password.",
                admin_email,
                password_matches,
                existing_admin.role,
                admin_email,
            )
        else:
            logger.info(
                "Initial admin user (%s) already exists with matching credentials. "
                "Skipping bootstrap.",
                admin_email,
            )
        return

    admin = Teacher(
        email=admin_email,
        password_hash=hash_password(settings.INITIAL_ADMIN_PASSWORD),
        role="admin",
    )
    db.add(admin)
    await db.commit()
    logger.info("Successfully created initial admin user (%s).", admin_email)
