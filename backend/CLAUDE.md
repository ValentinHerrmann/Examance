# Backend conventions

Loads when working under `backend/`. Cross-cutting rules are in the root `CLAUDE.md`.

Python 3.12, FastAPI (async), SQLAlchemy 2.0, Alembic, PostgreSQL (asyncpg; psycopg2 sync fallback), Redis (rate limiting + login cooloff), argon2-cffi, PyJWT, slowapi, cryptography, py_webauthn, Click CLI. Deps: `uv`.

- `app/main.py` → `create_app()`. Routers `auth, compile, exams, exercises, keys, mfa, webauthn, students, submissions, admin, user` (plus `training`) under `/api/v1`; `/api/health`; docs `/api/docs`.
- Tests in `backend/tests/`: pytest + pytest-asyncio, aiosqlite in-memory, httpx AsyncClient.
- Ruff `select = E,F,I,UP,S,B` (S = security, B = bugbear) and mypy `strict = true`. Lint is a security control here; keep new code passing both.
- Run mypy with the **dev** extras (`uvx -p 3.12 --with-editable ".[dev]" mypy app`, from `backend/`). A bare `mypy` reports ~187 spurious untyped-decorator errors, and one without `[dev]` disagrees with CI about `redis` (the `types-redis` stubs make `Redis` generic, redis 8's own types do not). The real baseline is zero errors.

## Environment

`backend/.env.example` → `backend/.env`. `CORS_ALLOWED_ORIGINS` defaults to `http://localhost:5173` + `https://examance.pages.dev`, plus `CORS_ALLOWED_ORIGIN_REGEX` covering `*.valentin-herrmann.com` and `*.examance.pages.dev`. With `ENVIRONMENT=development`, `effective_cors_origin_regex` also allows arbitrary loopback ports. No wildcard fallback; an empty list is a hard startup error (`require_cors_origins`, `app/config.py`).

`WEBAUTHN_RP_ID` is per stack: a passkey registered against production does not work against preview. Rotating `SECRET_KEY` invalidates every TOTP enrollment.

## Authentication and the data key

Background: `docs/data_flow_and_security.md`. Any change here touches auth/crypto; read that and `docs/breach_response_checklist.md` first.

**Sign-in is a passkey alone, or two-of-three factors** (password, passkey, TOTP). A passkey stands alone (`SELF_SUFFICIENT_FACTORS`) only because every ceremony requires user verification: never loosen that, never add password/TOTP there. Enrollment still demands two factors. `app/services/auth_policy.py` is the only place the rule lives.

- `POST /auth/login` does **not** return a session. It returns `{status, satisfied, available}` and sets a short-lived, single-use, non-refreshable `auth_pending` cookie. Backend tests that log in go through `tests/factors.py` (`sign_in`, `complete_login`, `complete_reset`), not `/auth/login` alone.
- Access-token scopes: `full` (two distinct factors), `auth_pending`, `enroll` (fewer than two factors enrolled), `reset_pending`. `get_current_teacher` demands `full`; `get_pending_teacher` returns a `PendingSession` for the rest. `/keys/envelopes` and `/mfa/*` deliberately accept the non-full scopes (an account that predates the envelope has one factor, so the wizard that gets it out of enrollment is also the one that first stores its key).
- `available` is only ever returned *after* a factor is proven. Never add an endpoint that answers "which factors does this email have": that is an account-existence oracle. TOTP is second-position only for the same reason.
- **An unapproved account holds no token of any kind** (`teachers.approved_at` NULL = pending self-registration). `advance_sign_in` answers `approval_pending` (no cookie) only after a factor was proven; `get_current_teacher`, `get_pending_teacher`, `/auth/refresh` and `verify_reset_token` refuse such accounts too. `approved_at` has no default on purpose (fail closed): every new `Teacher(...)` write path, tests included, must set it. Registrations live in `registration_requests` until the mailed link is used, so `teachers` only holds verified addresses. Public registration endpoints answer identically for known and unknown addresses and send mail from `BackgroundTasks`.
- Per-account features (`allow_server_results`, `allow_server_latex`) are decided in `app/services/capabilities.py` only; `require_server_latex` / `require_server_results_writable` gate the endpoints. Result writes stay allowed while an account revoked in `all-server` mode still has to move its results out; reads and deletes are never gated.
- Account deletion lives in `app/services/account_deletion.py`. Self-deletion runs only through the mailed single-use token (`/auth/account-deletion/confirm`; the preview never deletes). Kept exercises are ownerless (`teacher_id` NULL, `exam_id` NULL, group NULL): never treat `teacher_id IS NULL` as "visible to everyone". The SQLite test database does not enforce foreign keys, so tests cannot observe cascades.
- Removing a factor goes through `may_remove_factor`: never below two factors, never below the last *key-capable* one. TOTP is not key-capable (server-side secret, six digits).

**The data key is random and wrapped, not derived.** `key_envelopes` holds one wrap per factor; the payload is a *bundle* (`{dek, fallback, legacy}`) because `decrypt()` walks the whole PBKDF2 chain. Client side: `lib/crypto/keyEnvelope.ts` (wrap/unwrap) and `lib/services/keyEnvelopeService.ts` (lifecycle). Rules that cost data if broken:

- `sessionNonce` stays `getUserSessionNonce(email)`. Server-stored ciphertext was sealed under it.
- `openWithPassword(..., { allowMigration })`: only a password the server has **just accepted** may run the one-time migration (no envelope yet). The unlock page tracks `passwordVerified`; the vault prompt after a passkey-only sign-in passes `allowMigration: false`. Migrating with an unchecked password seals a wrong key as the DEK and orphans every existing record.
- The migration **adopts** the previously derived key as the DEK, so nothing is re-encrypted. It is also the only moment the fallback/legacy keys exist; capture them or those records are unreadable forever.
- A PRF passkey that signs in but cannot open the vault is **healed**: once the vault opens by password/recovery, `finishUnlock` writes a fresh wrap for it (`passkeyToHeal`). `EnvelopeChangedError` is never healed; it is the envelope-substitution alarm. Registration only wraps when the follow-up assertion's `rawId` matches the new credential.
- "Passkey opens data" = a non-invalidated passkey envelope exists (`passkeyWrapIds`), **never** `supports_prf` (a registration-time guess). Settings' "enable data access" (`enablePasskeyUnlock`) wraps from the open session, ceremony pinned via `allowCredentials`. Passkeys stored in Bitwarden had no PRF as of 2026; they sign in but cannot open data (verify before relying on this).
- Any server-side password write (admin reset, `cli.py set-password`, completing a reset) must call `invalidate_password_wrap`. The server cannot re-wrap a key it has never seen; marking the wrap stale sends the teacher to the recovery code instead of a vault of blank fields.
- `encryption_salt_b64` on student uploads carries the **`key_id`**, not a salt. The name is historical.

## Gotchas

- **A 500 has to carry CORS headers itself.** The global handler in `app/main.py` runs in `ServerErrorMiddleware`, outside `CORSMiddleware`, so an unhandled exception reaches the browser as "No 'Access-Control-Allow-Origin' header" and hides the real fault. The handler echoes an allowlisted `Origin` for that reason (`is_allowed_origin`, `app/middleware/cors.py`); do not remove it.
- `POST /auth/refresh` rotates the refresh token and treats reuse of a revoked one as theft (revokes all sessions). See the frontend guard in `frontend/CLAUDE.md`.
- `POST /exams` and `POST /exercises` are create-only (409 on a known id). Re-queuing can never succeed; clients use `PATCH`.
- Absent `annotation_ciphertext_b64` means "don't touch"; deleting needs `clear_annotations: true`.
- Per-exercise scores live in `exercise_scores` (no plaintext `score` column by design; the client seals the payload).
- The training-donation endpoint has its own constraints: `docs/dev/training_donation.md`.
