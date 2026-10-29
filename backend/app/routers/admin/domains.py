"""Admin: email domains whose registrations are approved automatically — /api/v1/admin/*"""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_admin_teacher
from app.models.allowed_email_domain import AllowedEmailDomain
from app.models.teacher import Teacher
from app.routers.admin.features import apply_features, features_of, patch_features
from app.schemas.admin import (
    AccountFeaturesUpdate,
    AllowedDomainRequest,
    AllowedDomainResponse,
)
from app.services import audit as audit_svc
from app.services import registration

router = APIRouter()


def _domain_out(row: AllowedEmailDomain) -> AllowedDomainResponse:
    return AllowedDomainResponse(
        id=row.id, domain=row.domain, features=features_of(row), created_at=row.created_at
    )


async def _load_domain(db: AsyncSession, domain_id: uuid.UUID) -> AllowedEmailDomain:
    row = await db.get(AllowedEmailDomain, domain_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found.")
    return row


@router.get("/allowed-domains")
async def list_allowed_domains(
    _admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[AllowedDomainResponse]:
    """Domains whose registrations are approved automatically (Admin only)."""
    rows = await db.scalars(select(AllowedEmailDomain).order_by(AllowedEmailDomain.domain))
    return [_domain_out(row) for row in rows]


@router.post(
    "/allowed-domains",
    status_code=status.HTTP_201_CREATED,
)
async def add_allowed_domain(
    body: AllowedDomainRequest,
    request: Request,
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AllowedDomainResponse:
    """Approve every future registration from a domain automatically (Admin only). Exact match on the part after '@'; subdomains need their own entry. Existing accounts are not affected."""
    try:
        domain = registration.normalize_domain(body.domain)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter a domain such as school.example.",
            headers={"code": "ERR_INVALID_DOMAIN"},
        ) from None
    row = AllowedEmailDomain(domain=domain)
    apply_features(row, body.features)
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This domain is already on the list.",
            headers={"code": "ERR_DOMAIN_EXISTS"},
        ) from None
    await db.refresh(row)
    await audit_svc.log(db, request, admin, "ALLOWED_DOMAIN_ADDED", domain)
    return _domain_out(row)


@router.patch("/allowed-domains/{domain_id}")
async def update_allowed_domain(
    domain_id: uuid.UUID,
    body: AccountFeaturesUpdate,
    request: Request,
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AllowedDomainResponse:
    """Change the features future registrations from a domain receive (Admin only)."""
    row = await _load_domain(db, domain_id)
    patch_features(row, body)
    await audit_svc.log(db, request, admin, "ALLOWED_DOMAIN_CHANGED", row.domain)
    await db.flush()
    return _domain_out(row)


@router.delete("/allowed-domains/{domain_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_allowed_domain(
    domain_id: uuid.UUID,
    request: Request,
    admin: Annotated[Teacher, Depends(get_admin_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    """Stop approving a domain automatically (Admin only). Existing accounts stay."""
    row = await _load_domain(db, domain_id)
    domain = row.domain
    await db.delete(row)
    await audit_svc.log(db, request, admin, "ALLOWED_DOMAIN_REMOVED", domain)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
