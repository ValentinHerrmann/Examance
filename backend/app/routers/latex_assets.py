"""Bundled LaTeX assets for the browser engine — GET /api/v1/latex-assets/..."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.dependencies import get_current_teacher
from app.middleware.rate_limit import limiter
from app.services.latex_assets import asset_manifest, resolve_asset

router = APIRouter(
    prefix="/latex-assets",
    tags=["latex-assets"],
    dependencies=[Depends(get_current_teacher)],
)

_CACHE_HEADERS = {"Cache-Control": "private, no-cache"}


@router.get("/index.json")
@limiter.limit("60/minute")
async def latex_assets_index(request: Request) -> dict[str, list[dict[str, str]]]:
    """Every asset with its SHA-256, so the client can verify what it fetched."""
    return {"files": [{"path": p, "sha256": h} for p, h in asset_manifest().items()]}


@router.get("/{asset_path:path}")
@limiter.limit("300/minute")
async def latex_asset(request: Request, asset_path: str) -> Response:
    """One bundled asset; revalidated via ETag so edits ship with the backend image."""
    path = resolve_asset(asset_path)
    if path is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset not found")
    etag = f'"{asset_manifest()[asset_path]}"'
    if request.headers.get("if-none-match") == etag:
        return Response(
            status_code=status.HTTP_304_NOT_MODIFIED, headers={**_CACHE_HEADERS, "ETag": etag}
        )
    return Response(
        content=path.read_bytes(),
        media_type="application/octet-stream",
        headers={**_CACHE_HEADERS, "ETag": etag},
    )
