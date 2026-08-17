"""FastAPI application factory, middleware registration, lifespan."""
from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.config import settings
from app.middleware.body_limit import BodyLimitMiddleware
from app.middleware.cors import add_cors_middleware
from app.middleware.csp import CSPMiddleware
from app.middleware.origin_guard import OriginGuardMiddleware
from app.middleware.rate_limit import limiter
from app.routers import admin, auth, compile, exams, exercises, students, submissions, user

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(levelname)s:\t%(name)s - %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan — run startup/shutdown logic here."""
    from app.database import AsyncSessionLocal
    from app.services.bootstrap import create_initial_admin

    async with AsyncSessionLocal() as session:
        await create_initial_admin(session)

    yield
    # Shutdown: close engine
    from app.database import engine
    await engine.dispose()


def create_app() -> FastAPI:
    openapi_tags = [
        {
            "name": "auth",
            "description": (
                "Authentication & session lifecycle (login, register, token refresh, logout) "
                "via HTTP-only cookies."
            ),
        },
        {
            "name": "compile",
            "description": "LaTeX document compilation service via sandboxed Tectonic engine.",
        },
        {
            "name": "exams",
            "description": (
                "Exam creation, metadata updates, exercise linking, and full PDF compilation."
            ),
        },
        {
            "name": "exercises",
            "description": (
                "Exercise library management, versioning, variants, grouping, "
                "and adoption tracking."
            ),
        },
        {
            "name": "students",
            "description": (
                "Encrypted student identity management and GDPR Art. 17 "
                "right-to-erasure processing."
            ),
        },
        {
            "name": "submissions",
            "description": (
                "Encrypted submission scan uploads, canvas annotation ciphertexts, "
                "and anonymized score tracking."
            ),
        },
        {
            "name": "admin",
            "description": (
                "System administration, user provision, audit logging, "
                "and k-anonymity class statistics (k >= 5)."
            ),
        },
        {
            "name": "user",
            "description": (
                "Teacher data lifecycle management (soft-delete and 7-day retention purge/restore)."
            ),
        },
        {
            "name": "meta",
            "description": "System health and operational monitoring.",
        },
    ]

    description = (
        "Privacy-first anonymous exam grading backend.\n\n"
        "## Key Security & Architecture Features\n"
        "- **Zero-Knowledge Encryption**: Student PII, submission scans, and annotations "
        "are encrypted client-side (Argon2id + AES-256-GCM) before reaching the server.\n"
        "- **Session Hygiene**: State stored in HttpOnly cookies (`access_token` 15 min, "
        "`refresh_token` 7 days with rotation & reuse detection).\n"
        "- **Privacy Safeguards**: LaTeX requests redacted in logs (`LaTeXRequest`), "
        "IP addresses stored as SHA-256 hashes, k-anonymity (k >= 5) enforced on class stats.\n"
        "- **LaTeX Engine**: Compilation rendered using sandboxed Tectonic "
        "(`tectonic --untrusted`)."
    )

    app = FastAPI(
        title="Examance API",
        version=settings.APP_VERSION,
        description=description,
        openapi_tags=openapi_tags,
        # Interactive docs enumerate every route and parameter, including the
        # admin surface. Offline reference stays available via
        # `python -m app.cli export-openapi`.
        docs_url="/api/docs" if settings.is_dev else None,
        redoc_url="/api/redoc" if settings.is_dev else None,
        openapi_url="/api/openapi.json" if settings.is_dev else None,
        lifespan=lifespan,
    )

    # Rate limiter state
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={"detail": "Internal server error"},
        )

    # Middleware — registration order matters (last added = outermost)
    app.add_middleware(BodyLimitMiddleware)
    if settings.ALLOWED_HOSTS:
        # Opt-in: rejects requests with an unexpected Host header. Left off when
        # unset so a deployment cannot be locked out by a wrong default.
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.ALLOWED_HOSTS)
    app.add_middleware(OriginGuardMiddleware)
    app.add_middleware(CSPMiddleware)
    add_cors_middleware(app)  # Must be after BodyLimit so CORS headers appear on 413 too

    # Routers
    API_PREFIX = "/api/v1"
    app.include_router(auth.router, prefix=API_PREFIX)
    app.include_router(compile.router, prefix=API_PREFIX)
    app.include_router(exams.router, prefix=API_PREFIX)
    app.include_router(exercises.router, prefix=API_PREFIX)
    app.include_router(students.router, prefix=API_PREFIX)
    app.include_router(submissions.router, prefix=API_PREFIX)
    app.include_router(admin.router, prefix=API_PREFIX)
    app.include_router(user.router, prefix=API_PREFIX)

    @app.get("/api/health", tags=["meta"])
    async def health() -> dict[str, str]:
        # `version` is deliberately public. It is how the frontend detects that
        # it is talking to an incompatible server (differing major version), and
        # it is the same class of information a Server header already leaks. No
        # authentication, crypto or retention behaviour depends on it.
        return {"status": "ok", "version": settings.APP_VERSION}

    return app


app = create_app()
