"""The pinned TeX Live tree for the browser engine — GET /api/v1/texlive/... (issue #346)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.dependencies import get_current_teacher
from app.middleware.rate_limit import limiter
from app.services.texlive_tree import resolve_tree_file, tree_manifest

router = APIRouter(
    prefix="/texlive",
    tags=["texlive"],
    dependencies=[Depends(get_current_teacher)],
)


def _unavailable() -> HTTPException:
    return HTTPException(
        status.HTTP_503_SERVICE_UNAVAILABLE,
        "This server has no TeX Live tree for the browser engine.",
        headers={"code": "ERR_TEXLIVE_UNAVAILABLE"},
    )


@router.get("/index.json")
@limiter.limit("30/minute")
async def texlive_index(request: Request) -> dict[str, str | dict[str, int]]:
    """Every served file with its size; the engine stats files from this and fetches bytes only when it reads them."""
    manifest = tree_manifest()
    if manifest is None:
        raise _unavailable()
    return {"version": manifest.version, "files": manifest.files}


@router.get("/{tree_path:path}")
@limiter.limit("3000/minute")
async def texlive_file(request: Request, tree_path: str) -> Response:
    """One file; the tree only changes with the image, and clients ask with ?v=<version>, so the response is cached for good."""
    manifest = tree_manifest()
    if manifest is None:
        raise _unavailable()
    path = resolve_tree_file(tree_path)
    if path is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    etag = f'"{manifest.version}"'
    headers = {"Cache-Control": "private, max-age=31536000, immutable", "ETag": etag}
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED, headers=headers)
    return Response(content=path.read_bytes(), media_type="application/octet-stream", headers=headers)
