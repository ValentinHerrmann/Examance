"""Application settings loaded from environment variables."""
from __future__ import annotations

import json
from urllib.parse import urlparse

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Signing keys that ship in this repository / in example configs. Usable for
# local development, never for a deployment that holds real data.
PLACEHOLDER_SECRET_KEYS = frozenset(
    {
        "dev-secret-key-change-me-in-production-32-chars-long!",
        "CHANGE_ME_IN_PRODUCTION_USE_openssl_rand_hex_32",
        "test-secret-key-not-for-production",
    }
)

# Free hosting domains, abused for phishing and so on URI blocklists (SURBL / URIBL / Spamhaus DBL):
# relays reject reset mails linking to them ("550 5.7.1 ... (B-URL)"). Use a custom domain that
# matches the SMTP_FROM_EMAIL domain instead.
BLOCKLISTED_LINK_DOMAINS = (
    ".pages.dev",
    ".workers.dev",
    ".vercel.app",
    ".netlify.app",
    ".web.app",
    ".firebaseapp.com",
)

# Loopback origins on arbitrary ports (http/https on localhost or 127.0.0.1).
# Appended to effective_cors_origin_regex ONLY when ENVIRONMENT == "development"
# to permit local frontend debugging without enabling local CSRF in production.
LOCALHOST_CORS_ORIGIN_REGEX = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    # asyncpg URL for the application (or SQLite in tests)
    DATABASE_URL: str = "sqlite+aiosqlite:///:memory:"
    DATABASE_URL_SYNC: str = ""  # psycopg2 URL for Alembic (derived if absent)

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # Rate limiting — storage defaults to REDIS_URL so counters are shared
    # across uvicorn workers. Override with "memory://" only for dev/tests.
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_STORAGE_URI: str = ""

    # JWT / Auth
    # Development-only default. `validate_secret_key` below rejects it whenever
    # ENVIRONMENT != "development", so it can never reach a real deployment.
    SECRET_KEY: str = "dev-secret-key-change-me-in-production-32-chars-long!"  # noqa: S105
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_TTL_MINUTES: int = 15
    REFRESH_TOKEN_TTL_DAYS: int = 7

    # CORS — required; app refuses to start if unset or empty
    CORS_ALLOWED_ORIGINS: list[str] = ["http://localhost:5173", "https://examance.pages.dev"]
    # Production base regex (fullmatch): valentin-herrmann.com (apex and subdomains) and
    # examance.pages.dev (plus its Cloudflare Pages previews). Loopback origins on any port are
    # added by `effective_cors_origin_regex` only when ENVIRONMENT == "development".
    CORS_ALLOWED_ORIGIN_REGEX: str | None = (
        r"https://([a-zA-Z0-9-]+\.)*valentin-herrmann\.com"
        r"|https://([a-zA-Z0-9-]+\.)?examance\.pages\.dev"
    )

    # Host header allowlist (Host-spoofing protection). Deployment-specific, so
    # it stays opt-in: TrustedHostMiddleware is only registered when non-empty.
    ALLOWED_HOSTS: list[str] = []

    # Environment
    ENVIRONMENT: str = "production"
    LOG_LEVEL: str = "INFO"

    # Build version baked into the image (Dockerfile ARG/ENV APP_VERSION) from the root VERSION
    # file. Informational: GET /api/health reports it so the frontend can check compatibility.
    # Production is bare semver ("1.4.0"); preview appends PR number and build time.
    APP_VERSION: str = "0.0.0-dev"

    # Retention bounds. MAX enforces Art. 5(1)(e) storage limitation: no exam lives indefinitely.
    # MIN is 0 on purpose: teachers must be able to delete a draft at once. The duty to retain
    # graded work (school law, e.g. BaySchO) binds the school, not each exam; schools may raise MIN.
    RETENTION_MIN_DAYS: int = 0
    RETENTION_MAX_DAYS: int = 3650          # 10 years
    # Grace period between soft-delete and irreversible erasure.
    RETENTION_GRACE_DAYS: int = 7
    # Audit entries carry teacher_email and ip_hash. Art. 17(3) justifies
    # keeping them, but not indefinitely.
    AUDIT_LOG_RETENTION_DAYS: int = 365
    # Opt-in, anonymous OMR training samples (routers/training.py). Unlinked to
    # any person, but still not kept forever.
    TRAINING_SAMPLE_RETENTION_DAYS: int = 730

    # Accept opt-in training-data donations (anonymous checkbox crops). False
    # disables POST /training/omr-samples and hides the option in the client.
    TRAINING_DONATION_ENABLED: bool = True
    # Donations need a signed-in account; these bound what one account, and all
    # accounts together, can add per UTC day (the endpoint answers 429 above).
    TRAINING_SAMPLES_PER_TEACHER_PER_DAY: int = 2000
    TRAINING_SAMPLES_PER_DAY_MAX: int = 20000

    # Body size limits (bytes). Compile requests carry the document plus its resource files
    # (base64, ~4/3 of raw); the compile route's 10/min rate limit bounds the volume.
    BODY_LIMIT_COMPILE: int = 28 * 1024 * 1024      # 28 MB
    # Tectonic runs at once per backend process (each can take a core and hundreds of MB). A request
    # waits for a slot up to its own compile timeout, then gets the usual timeout error.
    LATEX_MAX_CONCURRENT_COMPILES: int = Field(default=2, ge=1)
    # Single resource-file upload: 5 MB raw, base64-inflated, plus JSON slack.
    BODY_LIMIT_RESOURCE: int = 7 * 1024 * 1024      # 7 MB
    BODY_LIMIT_SUBMISSION: int = 50 * 1024 * 1024   # 50 MB
    BODY_LIMIT_STUDENTS: int = 1 * 1024 * 1024      # 1 MB
    # Up to 100 donated checkbox crops (3840 B raw, ~5.1 KB base64) plus features.
    BODY_LIMIT_TRAINING: int = 1 * 1024 * 1024      # 1 MB
    BODY_LIMIT_DEFAULT: int = 256 * 1024             # 256 KB

    # Initial admin bootstrap credentials
    INITIAL_ADMIN_EMAIL: str | None = None
    INITIAL_ADMIN_PASSWORD: str | None = None

    # SMTP configuration for email notification / password reset delivery
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_FROM_EMAIL: str = "noreply@examance.com"
    SMTP_USE_TLS: bool = True

    # Frontend base URL for email link generation
    FRONTEND_URL: str = "http://localhost:5173"

    # WebAuthn relying party; defaults to the FRONTEND_URL host. A passkey is bound to its RP ID,
    # so production and preview (different domains) each need their own value *and* enrollments.
    WEBAUTHN_RP_ID: str = ""
    WEBAUTHN_RP_NAME: str = "Examance"

    # Password reset configuration
    PASSWORD_RESET_TOKEN_TTL_HOURS: int = 24

    # Self-registration (app/services/registration.py), always available: the account exists only
    # after the mailed link is used and stays pending until admin approval (or an allowlisted
    # domain). Without SMTP the link cannot be delivered; `send_email` logs each failed delivery.
    REGISTRATION_TOKEN_TTL_HOURS: int = 24
    # Minimum gap between two verification mails to the same address.
    REGISTRATION_RESEND_COOLDOWN_SECONDS: int = 300
    # Verified accounts nobody approved are erased after this many days (only when they hold no
    # data, which a pending account cannot create).
    PENDING_ACCOUNT_RETENTION_DAYS: int = 90
    # Lifetime of the mailed link that confirms deleting one's own account
    # (app/services/account_deletion.py).
    ACCOUNT_DELETION_TOKEN_TTL_MINUTES: int = 60
    # Exercise contributions (issue #65): decided proposals (payload already cleared) are dropped
    # this many days after the decision; undecided ones after the second limit.
    CONTRIBUTION_RETENTION_DAYS: int = 30
    CONTRIBUTION_PENDING_MAX_DAYS: int = 180

    # Per-account login throttling (`app.services.login_throttle`): slowapi limits per client IP and
    # misses a distributed guess at one account. Exponential cooloff, capped on purpose so the lock
    # always expires: otherwise anyone who knows an email could lock its owner out.
    LOGIN_THROTTLE_ENABLED: bool | None = None  # defaults to RATE_LIMIT_ENABLED
    LOGIN_MAX_FAILED_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_BASE_SECONDS: int = 60
    LOGIN_LOCKOUT_MAX_SECONDS: int = 3600
    LOGIN_FAIL_WINDOW_SECONDS: int = 900

    @field_validator("ALLOWED_HOSTS", "CORS_ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: object) -> list[str]:
        if isinstance(v, str):
            v_str = v.strip()
            if v_str.startswith("["):
                parsed = json.loads(v_str)
                if not isinstance(parsed, list):
                    raise ValueError("Expected a JSON array of origin strings.")
                return [str(origin) for origin in parsed]
            return [origin.strip() for origin in v_str.split(",") if origin.strip()]
        return v  # type: ignore[return-value]

    @model_validator(mode="after")
    def require_cors_origins(self) -> Settings:
        if not self.CORS_ALLOWED_ORIGINS:
            raise ValueError(
                "CORS_ALLOWED_ORIGINS must be set and non-empty. "
                "App refuses to start without an explicit origin allowlist."
            )
        return self

    @model_validator(mode="after")
    def validate_secret_key(self) -> Settings:
        """
        Refuse to start outside development with a published or too-short key.

        SECRET_KEY signs both access and refresh tokens; a known value lets
        anyone mint an admin token. Generate one with: openssl rand -hex 32
        """
        if self.is_dev:
            return self
        if self.SECRET_KEY in PLACEHOLDER_SECRET_KEYS:
            raise ValueError(
                "SECRET_KEY is set to a published placeholder value. "
                "Generate a unique key with: openssl rand -hex 32"
            )
        if len(self.SECRET_KEY) < 32:
            raise ValueError(
                "SECRET_KEY must be at least 32 characters outside development. "
                "Generate one with: openssl rand -hex 32"
            )
        return self

    @model_validator(mode="after")
    def validate_initial_admin_password(self) -> Settings:
        """
        Refuse to start outside development with a published or too-short initial admin password.
        """
        if self.is_dev:
            return self
        if self.INITIAL_ADMIN_PASSWORD is not None:
            if (
                self.INITIAL_ADMIN_PASSWORD in PLACEHOLDER_SECRET_KEYS
                or len(self.INITIAL_ADMIN_PASSWORD) < 12
            ):
                raise ValueError(
                    "INITIAL_ADMIN_PASSWORD must be at least 12 characters outside development "
                    "and cannot be a published placeholder value."
                )
        return self

    @model_validator(mode="after")
    def validate_frontend_url_for_email(self) -> Settings:
        """Refuse to start when password-reset links would point at a blocklisted domain.

        Enforced only when mail is really sent (SMTP_HOST set, not development): the relay rejects
        the message at DATA time, long after the user requested the reset."""
        if self.is_dev or not self.SMTP_HOST:
            return self
        host = urlparse(self.FRONTEND_URL).hostname or ""
        if host.endswith(BLOCKLISTED_LINK_DOMAINS):
            raise ValueError(
                f"FRONTEND_URL host '{host}' is a free-hosting domain commonly listed on "
                "URL blocklists; outbound mail relays reject password-reset links pointing "
                "there. Point FRONTEND_URL at a custom domain (ideally sharing the registrable "
                "domain of SMTP_FROM_EMAIL), or leave SMTP_HOST unset to disable email delivery."
            )
        return self

    @model_validator(mode="after")
    def derive_rate_limit_storage(self) -> Settings:
        """Default the rate-limit backend to Redis; in-memory only in dev."""
        if not self.RATE_LIMIT_STORAGE_URI:
            self.RATE_LIMIT_STORAGE_URI = "memory://" if self.is_dev else self.REDIS_URL
        return self

    @model_validator(mode="after")
    def derive_webauthn_rp_id(self) -> Settings:
        """Default the relying-party ID to the frontend's own host."""
        if not self.WEBAUTHN_RP_ID:
            self.WEBAUTHN_RP_ID = urlparse(self.FRONTEND_URL).hostname or "localhost"
        return self

    @model_validator(mode="after")
    def derive_login_throttle(self) -> Settings:
        """Default per-account throttling to whatever rate limiting is doing."""
        if self.LOGIN_THROTTLE_ENABLED is None:
            self.LOGIN_THROTTLE_ENABLED = self.RATE_LIMIT_ENABLED
        if self.LOGIN_MAX_FAILED_ATTEMPTS < 1:
            raise ValueError("LOGIN_MAX_FAILED_ATTEMPTS must be at least 1.")
        if self.LOGIN_LOCKOUT_MAX_SECONDS < self.LOGIN_LOCKOUT_BASE_SECONDS:
            raise ValueError(
                "LOGIN_LOCKOUT_MAX_SECONDS must not be below LOGIN_LOCKOUT_BASE_SECONDS."
            )
        return self

    @model_validator(mode="after")
    def derive_sync_url(self) -> Settings:
        if not self.DATABASE_URL_SYNC:
            # Derive sync DB URL from async DB URL
            self.DATABASE_URL_SYNC = (
                self.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
                .replace("sqlite+aiosqlite://", "sqlite://")
            )
        return self

    @property
    def is_dev(self) -> bool:
        return self.ENVIRONMENT == "development"

    @property
    def effective_cors_origin_regex(self) -> str | None:
        """Return the combined CORS origin regex.

        Development also permits any port on localhost/127.0.0.1; production never does, to keep
        local-dev CSRF vectors away from hosted instances."""
        if not self.is_dev:
            return self.CORS_ALLOWED_ORIGIN_REGEX
        if self.CORS_ALLOWED_ORIGIN_REGEX:
            return f"{self.CORS_ALLOWED_ORIGIN_REGEX}|{LOCALHOST_CORS_ORIGIN_REGEX}"
        return LOCALHOST_CORS_ORIGIN_REGEX


settings = Settings()
