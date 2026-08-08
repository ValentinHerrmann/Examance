# Examance (repo: BlindGrade)

> Start every response with "Vale" (just the name, then continue normally). This is a tripwire: if you ever stop doing this, Vale knows context got lost or this file stopped being read, and can catch it immediately instead of discovering it later.

Examance is the current product name. "BlindGrade" is the old name — it's still the repo name and shows up in some internal identifiers (DB user, default CORS origin, etc.). Don't try to "fix" these; they're just legacy naming.

Privacy-first, zero-knowledge-encrypted anonymous exam grading app. Teachers create LaTeX-based exams, scan and QR-decode pseudonymous student submissions, grade with canvas annotations, and get analytics. Client-side encryption at rest (Argon2id + HKDF-SHA-256 + AES-256-GCM — see `docs/data_flow_and_security.md`). Two storage modes: `local-only` (IndexedDB via Dexie, the default) and `server-synced`.

## Architecture

**Backend** — `backend/`: Python 3.12, FastAPI (async), SQLAlchemy 2.0, Alembic migrations, PostgreSQL (asyncpg + psycopg2 sync fallback) + Redis (rate limiting), Argon2-cffi, PyJWT, slowapi, Click CLI. Dep manager: `uv`. Entry point `app/main.py` (`create_app()` factory); routers `auth, compile, exams, exercises, students, submissions, admin, user` mounted under `/api/v1`; health check at `/api/health`; docs at `/api/docs`. Layout: `app/{config.py,database.py,dependencies.py,cli.py,middleware,models,routers,schemas,services}`. Tests in `backend/tests/` (pytest + pytest-asyncio, aiosqlite in-memory DB, httpx AsyncClient). Ruff selects `E,F,I,UP,S,B` (includes security + bugbear rules) and mypy runs `strict=true` — keep new code passing both, this project treats lint as a security control, not a style nit.

**Frontend** — `frontend/`: SvelteKit 2.5 on **Svelte 4** (not 5) + TypeScript + Vite 5 + Tailwind v4, `adapter-static` (SPA build to `frontend/build/`). Client-side crypto (`argon2-browser`), local persistence via `dexie` (IndexedDB — the primary encrypted datastore in local mode), PDF handling (`pdf-lib`, `pdfjs-dist`), QR decode (`zxing-wasm`) / generate (`qrcode`), in-browser LaTeX via `texlyre-busytex` (WASM, compiles through Tectonic). Layout: `frontend/src/lib/{analytics,api,archive,components,crypto,db,exam,exercise-library,gdpr,grading,hardware,latex,repositories,services,stores,utils,workers}`; routes under `frontend/src/routes/{admin,analytics,exam,exercises,settings,unlock}`.

- **Components**: new ones go in `frontend/src/lib/components/<feature>/`. Nine legacy components still sit loose at the root of `frontend/src/lib/components/` (`ConfirmDialog`, `DualPdfPreview`, `ExerciseEditorModal`, `GradingKeyEditor`, `LatexEditor`, `LatexViewer`, `SessionTimeoutWarning`, `StoragePolicyModal`, `ZoomableImage`) — leftovers, not the model to copy. Routes (`+page.svelte`) keep data-loading, handlers, and session state; components get markup. Wire with callback props (`onAction={handler}`, `bind:value`), **not** `createEventDispatcher` — five of those legacy root components still use the dispatcher (`ConfirmDialog`, `DualPdfPreview`, `ExerciseEditorModal`, `LatexEditor`, `StoragePolicyModal`); don't follow their lead. One documented exception to prop-drilling: `frontend/src/lib/grading/gradingStore.ts`, where leaf grading components subscribe to the store directly (15+ interdependent fields — justified in-file).
- **Styles**: keep them in the component's own `.svelte` `<style>` block. Don't create a sibling `.css` file — older components that have one are mid-migration away from that pattern, not the model to copy.
- **Known pre-existing gaps** (don't reflexively "fix" these — flag if you touch them): `npm run lint` runs `eslint .` but no eslint config file exists anywhere in the repo, despite eslint deps being installed and CI running the step. `svelte-check` has 2 known pre-existing errors from missing `d3-scale` types in `SubmissionHistogram.svelte` / `GradeDistribution.svelte` (documented in `PLAN.md` as out of scope) — note `d3-scale` isn't declared in `frontend/package.json` at all, it only resolves transitively through `layerchart`, so this is a latent breakage and not just a missing-types nit.

## Commands

| Command | What it does |
|---|---|
| `make dev-up` / `make dev-down` | docker compose: db + redis + backend |
| `make install` / `make install-frontend` | backend deps (`uv pip install -e ".[dev]"`) / frontend deps (`npm install`) |
| `make migrate` | apply Alembic migrations |
| `make migrate-auto MSG="..."` | autogenerate a migration from model changes |
| `make lint` / `make lint-frontend` | backend: `ruff check app && mypy app` / frontend: `npm run lint && npm run check` |
| `make test-backend` / `make test-frontend` / `make test` | pytest / vitest / both |
| `npm run test:e2e` | Playwright (frontend, not wired into `make`) |
| `npm run sri:verify` | subresource-integrity check (also runs in CI) |

Prefer these `make` targets over hand-rolled `cd backend && ...` / `cd frontend && ...` invocations. Frontend `dev`/`build` run `predev`/`prebuild` scripts that fetch LaTeX/WASM assets — don't strip those steps out.

## Token discipline

Context in this repo is cheap to waste: the tracked source surface is tiny (172 files under `frontend/src`, 44 under `backend/app`, ~1 MB total) while the working tree is ~2 GB of generated assets. Budget accordingly.

**Context budget**

- **Never walk generated trees**: `frontend/build/` (~500 MB), `frontend/node_modules/` (~350 MB), `frontend/static/core/busytex/` (~500 MB of WASM, fetched by `predev`/`prebuild`/`postinstall`), `frontend/.svelte-kit/`, `backend/__pycache__/`, `backend/blindgrade.db`, `latex-sample-project/`. Scope searches with `git ls-files` or explicit globs instead of recursing from the repo root.
- **Lockfiles are grep-only**: `frontend/package-lock.json` (7051 lines) and `backend/uv.lock` (1652 lines). Grep for the one package; never read either whole.
- **`frontend/static/latex-assets/` is a build-time `cp -r` copy of `backend/latex-assets/`** (see the `predev`/`prebuild` scripts). Both are committed, so reading both is duplicate context — treat the backend copy as the source of truth and edit there.
- **Read big files in slices**: `routes/exam/[id]/+page.svelte` (1266), `routes/exercises/+page.svelte` (1265), `routes/exam/[id]/scan/+page.svelte` (1036), `lib/db/dbEncryption.ts` (649), `routes/exam/new/+page.svelte` (618), `lib/components/grading/ScanCanvasViewer.svelte` (604). Grep to the symbol first, then Read with `offset`/`limit`.
- **Prefer narrow commands while iterating**: `pytest tests/test_auth.py -q`, `npx vitest run <file>`, `npx svelte-check --threshold error` (plain `npm run check` buries the 2 real errors under ~106 unused-CSS warnings). The full `make` targets still run once at the end — "Validate before calling it done" below is authoritative.
- **Don't reinstall casually**: `npm install` fires `postinstall`, which re-downloads the busytex assets.
- **Delegate wide searches** to subagents and report the conclusion, not the file dumps.
- **No verification-by-reread**: Edit/Write error out when they fail, so re-reading a file to confirm a successful edit is pure waste.

**Output shaping**

- **Reply in caveman style, level `full`** (`caveman` plugin skill; `/caveman full` re-arms it, `/caveman off` disables): drop articles, filler, hedging, pleasantries; fragments are fine; short synonyms over long ones. Technical terms, identifiers, commands, numbers, and exact error strings stay verbatim. Never compress negations (`not`/`never`/`only`/`except`), security warnings, irreversible-action confirmations, or ordered multi-step instructions — those stay in plain prose.
- **Persisted prose stays normal English**: code, comments, commit messages, docs, PR/issue text, and memory files, regardless of reply style.
- **No progress narration**: fire tool calls directly, no "now I'll check X" preamble between them. Text before a call only to flag something destructive or resolve a real ambiguity.
- **No code echo**: don't paste back diffs or file contents the tool result already displayed — reference `file:line` instead.

## Deployment

Frontend deploys to **Cloudflare Pages** via git integration (build command `npm run build` in `frontend/`, output directory `frontend/build/`, matching the `adapter-static` SvelteKit build). Production origin is `examance.pages.dev`, plus a custom domain under `valentin-herrmann.com` — both are allow-listed in the backend's CORS config. There's no `wrangler.toml` or CF-specific deploy step in this repo; it's dashboard-managed on the Cloudflare side. Backend hosting isn't declared anywhere in-repo — don't assume where it runs.

## Environment

Copy `backend/.env.example` to `backend/.env` and adjust. Postgres + Redis run via `docker-compose.yml`. `CORS_ALLOWED_ORIGINS` has a non-wildcard default allowlist (`http://localhost:5173`, `https://examance.pages.dev`), complemented by `CORS_ALLOWED_ORIGIN_REGEX` for `*.valentin-herrmann.com`; setting it to an empty list is a hard startup error (`require_cors_origins` validator in `backend/app/config.py`). There is no wildcard fallback — override the default explicitly for any other deployment origin.

## Standing instructions

- **Validate before calling it done**: run `make lint`/`make test-backend` or `make lint-frontend`/`make test-frontend` (whichever side you touched) before saying a change is finished. This mirrors CI (`.github/workflows/ci.yml`), which also runs `pip-audit`/`npm audit` (fail on HIGH) and SRI verification.
- **Security/privacy first**: this app does client-side encryption-at-rest and handles GDPR-regulated data. Explicitly call out any change touching auth, crypto, or data retention rather than quietly proceeding — check `docs/data_flow_and_security.md` and `docs/breach_response_checklist.md` for context first.
- **No secrets in commits**: never commit `backend/.env` or real secret values. `backend/.env.example` is a template only.
- **Dependency manager discipline**: `uv` for backend, `npm` for frontend (matches the Makefile) — don't introduce pip, poetry, or yarn.
- **Local mode is the default** for exercise/exam management — don't default to backend-server endpoints when local-only code paths exist.
- Mind WASM/Argon2 asset resolution (`busytex.wasm`, `argon2.wasm`) when touching frontend bundling config.
- Don't run npm commands that don't terminate on their own (dev servers, watch mode) unless explicitly asked to.

These fold in and supersede `.github/copilot-instructions.md` (kept for GitHub Copilot, which doesn't read this file) — if you update one, update the other.
