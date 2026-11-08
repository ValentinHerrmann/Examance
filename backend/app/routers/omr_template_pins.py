"""Pinned OMR templates (issue #239) - /api/v1/exams/{id}/omr-template-pins. The layout is sealed client-side; the server stores ciphertext only. PUT is keyed on (exam, layout hash): idempotent, safe to replay offline."""
from __future__ import annotations

import base64
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_exam_for_teacher, get_teaching_teacher
from app.models.exam import Exam
from app.models.omr_template_pin import OmrTemplatePin
from app.schemas.binary import GCM_IV_BYTES, decode_b64
from app.schemas.omr_template_pin import OmrTemplatePinIn, OmrTemplatePinOut

router = APIRouter(
    prefix="/exams/{exam_id}/omr-template-pins",
    tags=["omr-template-pins"],
    dependencies=[Depends(get_teaching_teacher)],
)

MAX_CIPHERTEXT_BYTES = 4 * 1024 * 1024
MIN_CIPHERTEXT_BYTES = 16  # the GCM tag alone

LayoutHash = Annotated[str, Path(pattern=r"^[0-9a-f]{64}$")]


def _to_out(row: OmrTemplatePin) -> OmrTemplatePinOut:
    return OmrTemplatePinOut(
        layout_hash=row.layout_hash,
        source=row.source,
        pinned_at=row.pinned_at,
        last_pinned_at=row.last_pinned_at,
        payload_ciphertext_b64=base64.b64encode(row.payload_ciphertext).decode(),
        payload_iv_b64=base64.b64encode(row.payload_iv).decode(),
    )


def _decode_payload(body: OmrTemplatePinIn) -> tuple[bytes, bytes]:
    """Strict base64, then the size rules; 422 for a malformed payload, 413 over the cap."""
    try:
        ciphertext = decode_b64(body.payload_ciphertext_b64, "payload_ciphertext_b64")
        iv = decode_b64(body.payload_iv_b64, "payload_iv_b64", expected_len=GCM_IV_BYTES)
    except HTTPException as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=exc.detail
        ) from None
    if len(ciphertext) > MAX_CIPHERTEXT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="The pinned template is too large.",
            headers={"code": "ERR_OMR_PIN_TOO_LARGE"},
        )
    if len(ciphertext) < MIN_CIPHERTEXT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Field 'payload_ciphertext_b64' is too short.",
        )
    return ciphertext, iv


async def _find(db: AsyncSession, exam: Exam, layout_hash: str) -> OmrTemplatePin | None:
    return await db.scalar(
        select(OmrTemplatePin).where(
            OmrTemplatePin.exam_id == exam.id, OmrTemplatePin.layout_hash == layout_hash
        )
    )


@router.get("")
async def list_pins(
    exam: Annotated[Exam, Depends(get_exam_for_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[OmrTemplatePinOut]:
    rows = await db.scalars(
        select(OmrTemplatePin)
        .where(OmrTemplatePin.exam_id == exam.id)
        .order_by(OmrTemplatePin.pinned_at.desc())
    )
    return [_to_out(row) for row in rows]


@router.put("/{layout_hash}")
async def put_pin(
    layout_hash: LayoutHash,
    body: OmrTemplatePinIn,
    exam: Annotated[Exam, Depends(get_exam_for_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OmrTemplatePinOut:
    """Pin a layout. A known hash keeps its first source, payload and `pinned_at` and only refreshes `last_pinned_at`."""
    ciphertext, iv = _decode_payload(body)
    row = await _find(db, exam, layout_hash)
    if row is None:
        row = OmrTemplatePin(
            exam_id=exam.id,
            layout_hash=layout_hash,
            source=body.source,
            payload_ciphertext=ciphertext,
            payload_iv=iv,
            byte_size=len(ciphertext),
        )
        db.add(row)
    else:
        row.last_pinned_at = datetime.now(UTC)
    await db.flush()
    await db.refresh(row)
    return _to_out(row)


@router.delete("/{layout_hash}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pin(
    layout_hash: LayoutHash,
    exam: Annotated[Exam, Depends(get_exam_for_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    row = await _find(db, exam, layout_hash)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pin not found.")
    await db.delete(row)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
