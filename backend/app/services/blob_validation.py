"""Size rules for uploaded files (logos, LaTeX resources): one definition of "empty" and "too large". Callers pick the exception type their layer already maps (HTTP, `LogoError`, ...)."""
from __future__ import annotations

from fastapi import HTTPException, status

_MB = 1024 * 1024


class UploadRejected(ValueError):
    """An empty upload; the message names the file and is safe to show."""


class UploadTooLarge(UploadRejected):
    """An upload over its limit (HTTP 413)."""


def check_upload(
    content: bytes, max_bytes: int, label: str, error: type[ValueError] | None = None
) -> None:
    """Reject empty *content* and anything over *max_bytes*. *label* names the file in the message; *error* replaces the exception type (it must take just the message)."""
    if not content:
        raise (error or UploadRejected)(f"{label} is empty.")
    if len(content) > max_bytes:
        raise (error or UploadTooLarge)(f"{label} is larger than {max_bytes // _MB} MB.")


def payload_too_large(detail: str) -> HTTPException:
    """413 carrying the code clients translate (the body-limit middleware answers the same)."""
    return HTTPException(
        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        detail=detail,
        headers={"code": "ERR_PAYLOAD_TOO_LARGE"},
    )


def upload_http_error(exc: UploadRejected) -> HTTPException:
    """The response for a rejected upload: 413 when too large, else 400."""
    if isinstance(exc, UploadTooLarge):
        return payload_too_large(str(exc))
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
