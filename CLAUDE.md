# Examance (repo: BlindGrade)

> Start every response with "Vale". Tripwire: if it stops, this file stopped being read.

Examance = product name. "BlindGrade" = old name, still the repo name and some internal identifiers (DB user, default CORS origin). Legacy, not bugs — don't "fix".

Privacy-first, zero-knowledge-encrypted anonymous exam grading. LaTeX exams, QR-decoded pseudonymous submissions, canvas-annotation grading, analytics. Client-side encryption at rest: Argon2id + HKDF-SHA-256 + AES-256-GCM (`docs/data_flow_and_security.md`).

Storage modes (`lib/stores/storagePolicy.ts`, `docs/dev/storage_modes.md`, issue #47): every session is a server-account session (the `all-local` mode and the passphrase login were discontinued). Exams/exercises always live on the server; the mode only decides where grading results live: `all-server` or `hybrid` (results only in this browser, IndexedDB). **The mode belongs to the account** (`teachers.storage_mode`, nullable, no default; first sign-in must choose in the non-dismissible settings modal) and comes with the account's capabilities (`GET /user/capabilities`, `backend/app/services/capabilities.py`): render mode/feature options from `stores/capabilities.ts`, never from hard-coded lists. Two per-account admin switches are enforced (issue #53): `server_results` (whether `all-server` is allowed) and `server_latex`; compile sites pick their engine through `effectiveLatexCompilation()`, never the raw preference. Accounts come from an admin invitation, the CLI/bootstrap, or self-registration (`REGISTRATION_ENABLED`): verify e-mail, set password, then admin approval unless the domain is on the always-allowed list (`backend/app/services/registration.py`, `docs/account_creation_and_management.md`). Switching is a **fluent move** of the results (`services/resultsMover.ts`: idempotent per-exam upserts, verify, then compare-and-set the mode, then keep/delete the old copy). `commitStorageMode(mode, token)` is armed only by `lib/db/workspace.ts`; after every unlock call `openWorkspace()` (owner binding + mode load; `needs-choice`/blocked states keep routes unmounted).

## Where things live

- `backend/` — FastAPI + SQLAlchemy + Alembic. Conventions, auth/data-key rules, backend gotchas: `backend/CLAUDE.md`.
- `frontend/` — SvelteKit 3 on **Svelte 5 (runes only)**. Design system, responsive rules, i18n, MC data model, LaTeX resources, frontend gotchas: `frontend/CLAUDE.md`.
- `docs/` — product, legal and deployment docs. Developer deep-dives, read on demand: `docs/dev/omr.md` (MC detection), `docs/dev/training_donation.md`, `docs/dev/ci_and_audit.md`, `docs/dev/build_and_csp.md`.
- `backend/latex-assets/` is copied to `frontend/static/latex-assets/` at build time; both are committed. Edit the backend copy.

## Commands

| Command | What it does |
|---|---|
| `make dev-up` / `make dev-down` | docker compose: db + redis + backend |
| `make install` / `make install-frontend` | `uv pip install -e ".[dev]"` / `npm install` |
| `make migrate` / `make migrate-auto MSG="..."` | apply Alembic migrations / autogenerate one |
| `make lint` / `make lint-frontend` | `ruff check app && mypy app` / `npm run lint && npm run check` |
| `make test-backend` / `make test-frontend` / `make test` | pytest / vitest / both |
| `npm run test:e2e` | Playwright suite (not wired into `make`) |
| `npm run sri:verify` | subresource-integrity check (also in CI) |

Prefer `make` over hand-rolled `cd backend && ...`. Deps: `uv` backend, `npm` frontend; no pip, poetry, yarn. mypy needs the dev extras (see `backend/CLAUDE.md`).

## Token discipline

- Never walk: `frontend/build/`, `frontend/node_modules/`, `frontend/static/core/busytex/` (~500 MB WASM), `frontend/.svelte-kit/`, `backend/blindgrade.db`, `latex-sample-project/`. Scope with `git ls-files` or explicit globs; never recurse from the root.
- Lockfiles (`frontend/package-lock.json`, `backend/uv.lock`) are grep-only.
- Files over ~600 lines (e.g. `routes/exam/[id]/+page.svelte`, `routes/exam/[id]/scan/+page.svelte`, `routes/exam/new/+page.svelte`, `routes/exercises/+page.svelte`, `ScanCanvasViewer.svelte`): grep to the symbol, then Read with `offset`/`limit`.
- Narrow commands while iterating: `pytest tests/test_auth.py -q`, `npx vitest run <file>`, `npx svelte-check --threshold error` (plain `npm run check` buries real errors under CSS warnings). Full `make` targets once at the end.

## Deployment (rules only; full picture in `docs/deployment.md`)

- Two independent stacks, production and preview, on the same version. Root `/VERSION` (bare semver) is the single source of truth; `frontend/package.json` and `backend/pyproject.toml` versions are **not** part of the chain, don't "sync" them. A differing major version means frontend and backend are incompatible.
- Release workflow triggers on `published`, **not** `created` (`created` also fires on draft-save).
- **One shared preview stack.** The newest non-draft PR push wins for both frontend and backend, so testing PR A after PR B was pushed means testing B. The footer version carries the PR number; check it before debugging.
- Frontend is Cloudflare Pages (builds only `release` and `preview`); backend is Docker behind Caddy on one SSH host. Migrations run **forward only** on deploy; rolling back an image does not undo them.
- CSP: never hard-code a `sha256-` literal in `frontend/static/_headers` (it is a template filled at build), and never widen `script-src` to silence a CSP error. Details and diagnosis: `docs/dev/build_and_csp.md`.

## Standing instructions

- **Prefer cheaper models** for mechanical or well-defined work and hand it off aggressively (wide searches go to subagents, which report conclusions rather than file dumps). Expensive models are on a tight budget; escalate only when reasoning complexity really demands it.
- **Only basic verification, don't run unit tests.** Extensive testing is done by a human. Don't run non-terminating npm commands (dev servers, watch mode) unless asked.
- **Security/privacy first**: client-side encryption at rest, GDPR-regulated data. Call out any change touching auth, crypto or retention, and read `docs/data_flow_and_security.md` and `docs/breach_response_checklist.md` first.
- **No secrets in commits**: never commit `backend/.env` or real secret values. `backend/.env.example` is a template.
- **Results follow the account's mode**: route students/submissions/scores through their repositories (`resultsAreLocal()` = hybrid); never write results to the other side directly outside `resultsMover.ts`.
- **NEVER USE WRITING GIT COMMANDS when running on a computer** (commit, push, branch, …). Only allowed in cloud mode.
- **Follow Claude-Code mode strictly**: never edit files in planning mode, don't even ask. Just make a PLAN in plan mode.
- Keep in-app help and documentation up to date.
- If you learn something future agent sessions should know (structure, constraints), add it to the closest `CLAUDE.md` or `docs/dev/` file, but don't clutter. Persisted prose (code, comments, commits, docs, PRs, memory) is normal English, not caveman.
