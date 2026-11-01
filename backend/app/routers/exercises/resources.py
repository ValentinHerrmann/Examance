"""Files attached to an exercise so its LaTeX can reference them (\\includegraphics, \\input).

Stored in plaintext, exactly like latex_body; see docs/data_flow_and_security.md."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_exercise_for_teacher, get_readable_exercise
from app.models.exercise import Exercise
from app.models.exercise_resource import ExerciseResource
from app.schemas.binary import decode_b64
from app.schemas.resource import (
    ExerciseResourceCreate,
    ExerciseResourceRename,
    ExerciseResourceResponse,
)
from app.services import exercise_sharing as sharing
from app.services import trash
from app.services.blob_validation import (
    UploadRejected,
    check_upload,
    payload_too_large,
    upload_http_error,
)
from app.services.latex_resources import (
    MAX_EXERCISE_RESOURCE_BYTES,
    MAX_RESOURCE_BYTES,
    resource_response,
)

router = APIRouter()


async def _get_resource(
    exercise_id: uuid.UUID, resource_id: uuid.UUID, db: AsyncSession
) -> ExerciseResource:
    result = await db.execute(
        select(ExerciseResource).where(
            ExerciseResource.id == resource_id,
            ExerciseResource.exercise_id == exercise_id,
        )
    )
    row: ExerciseResource | None = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")
    return row


@router.get("/{exercise_id}/resources")
async def list_exercise_resources(
    ex: Exercise = Depends(get_readable_exercise),
    db: AsyncSession = Depends(get_db),
) -> list[ExerciseResourceResponse]:
    """List an exercise's resource files (metadata only, no bytes)."""
    rows = (
        (
            await db.execute(
                select(ExerciseResource)
                .where(ExerciseResource.exercise_id == ex.id)
                .order_by(ExerciseResource.filename)
            )
        )
        .scalars()
        .all()
    )
    return [ExerciseResourceResponse.model_validate(r) for r in rows]


@router.post(
    "/{exercise_id}/resources",
    status_code=status.HTTP_201_CREATED,
)
async def create_exercise_resource(
    body: ExerciseResourceCreate,
    ex: Exercise = Depends(get_exercise_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> ExerciseResourceResponse:
    """Attach a file to an exercise. Uploading an existing filename replaces it. The filename is sanitised and checked against the bundled LaTeX assets by the schema; SVG is refused there with a convert-to-PDF hint."""
    content = decode_b64(body.content_b64, "content_b64")
    try:
        check_upload(content, MAX_RESOURCE_BYTES, f"'{body.filename}'")
    except UploadRejected as exc:
        raise upload_http_error(exc) from None

    existing = (
        (
            await db.execute(
                select(ExerciseResource).where(ExerciseResource.exercise_id == ex.id)
            )
        )
        .scalars()
        .all()
    )
    replaced = next((r for r in existing if r.filename == body.filename), None)
    used = sum(r.byte_size for r in existing if r is not replaced)
    if used + len(content) > MAX_EXERCISE_RESOURCE_BYTES:
        raise payload_too_large(
            "This exercise's resource files would exceed the "
            f"{MAX_EXERCISE_RESOURCE_BYTES // (1024 * 1024)} MB limit."
        )

    if replaced is not None:
        replaced.mime_type = body.mime_type
        replaced.byte_size = len(content)
        replaced.content = content
        replaced.content_sha256 = sharing.sha256_hex(content)
        await db.flush()
        updated: ExerciseResourceResponse = ExerciseResourceResponse.model_validate(replaced)
        return updated

    row = ExerciseResource(
        exercise_id=ex.id,
        filename=body.filename,
        mime_type=body.mime_type,
        byte_size=len(content),
        content=content,
        content_sha256=sharing.sha256_hex(content),
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A resource with this name already exists for this exercise.",
        ) from None
    created: ExerciseResourceResponse = ExerciseResourceResponse.model_validate(row)
    return created


@router.get("/{exercise_id}/resources/{resource_id}")
async def download_exercise_resource(
    resource_id: uuid.UUID,
    ex: Exercise = Depends(get_readable_exercise),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Return a resource's raw bytes (see `resource_response` for the XSS hardening)."""
    row = await _get_resource(ex.id, resource_id, db)
    return resource_response(row.content, row.mime_type, row.filename)


@router.patch("/{exercise_id}/resources/{resource_id}")
async def rename_exercise_resource(
    resource_id: uuid.UUID,
    body: ExerciseResourceRename,
    ex: Exercise = Depends(get_exercise_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> ExerciseResourceResponse:
    """Rename a resource file (the LaTeX source must be updated by the caller)."""
    row = await _get_resource(ex.id, resource_id, db)
    row.filename = body.filename
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A resource with this name already exists for this exercise.",
        ) from None
    renamed: ExerciseResourceResponse = ExerciseResourceResponse.model_validate(row)
    return renamed


@router.delete(
    "/{exercise_id}/resources/{resource_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_exercise_resource(
    resource_id: uuid.UUID,
    trash_scope: trash.Trash,
    ex: Exercise = Depends(get_exercise_for_teacher),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete one resource file; the trash keeps a copy (issue #125). Idempotent."""
    result = await db.execute(
        select(ExerciseResource).where(
            ExerciseResource.id == resource_id,
            ExerciseResource.exercise_id == ex.id,
        )
    )
    doomed: ExerciseResource | None = result.scalar_one_or_none()
    if doomed is not None:
        snap = await trash.snapshot_resource(db, doomed.id)
        label = {**trash.exercise_label(ex), "filename": doomed.filename}
        await trash_scope.capture(db, "resource", snap, label=label)
        await snap.delete(db)
