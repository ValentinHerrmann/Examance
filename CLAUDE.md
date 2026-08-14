# Examance (repo: BlindGrade)

> Start every response with "Vale". Tripwire: if it stops, this file stopped being read.

Examance = product name. "BlindGrade" = old name, still the repo name and some internal identifiers (DB user, default CORS origin). Legacy, not bugs — don't "fix".

Privacy-first, zero-knowledge-encrypted anonymous exam grading. LaTeX exams, QR-decoded pseudonymous submissions, canvas-annotation grading, analytics. Client-side encryption at rest: Argon2id + HKDF-SHA-256 + AES-256-GCM (`docs/data_flow_and_security.md`). Storage modes: `local-only` (IndexedDB/Dexie, default), `server-synced`.

## Architecture

**Backend** `backend/` — Python 3.12, FastAPI async, SQLAlchemy 2.0, Alembic, PostgreSQL (asyncpg; psycopg2 sync fallback), Redis (rate limiting), argon2-cffi, PyJWT, slowapi, Click CLI. Deps: `uv`.

- `app/main.py` → `create_app()`. Routers `auth, compile, exams, exercises, students, submissions, admin, user` under `/api/v1`; `/api/health`; docs `/api/docs`.
- `app/{config,database,dependencies,cli}.py` + `middleware,models,routers,schemas,services`.
- Tests `backend/tests/`: pytest + pytest-asyncio, aiosqlite in-memory, httpx AsyncClient.
- Ruff `select = E,F,I,UP,S,B` (S=security, B=bugbear), mypy `strict=true`. Lint is a security control here — keep new code passing both.

**Frontend** `frontend/` — SvelteKit 2.5 on **Svelte 4 (not 5)**, TypeScript, Vite 5, Tailwind v4, `adapter-static` → `frontend/build/`. `argon2-browser`, `dexie` (IndexedDB, primary encrypted store in local mode), `pdf-lib`/`pdfjs-dist`, `zxing-wasm` (QR decode) / `qrcode` (generate), `texlyre-busytex` (WASM LaTeX via Tectonic).

- `src/lib/{analytics,api,archive,components,crypto,db,exam,exercise-library,gdpr,grading,hardware,latex,repositories,services,stores,utils,workers}`; `src/routes/{admin,analytics,exam,exercises,settings,unlock}`.
- **Components**: new ones → `src/lib/components/<feature>/`. Nine legacy ones sit loose at `components/` root (`ConfirmDialog`, `DualPdfPreview`, `ExerciseEditorModal`, `GradingKeyEditor`, `LatexEditor`, `LatexViewer`, `SessionTimeoutWarning`, `StoragePolicyModal`, `ZoomableImage`) — leftovers, don't copy. Routes hold data-loading, handlers, session state; components hold markup. Wire with callback props (`onAction={handler}`, `bind:value`), **not** `createEventDispatcher` — 5 legacy roots still use it (`ConfirmDialog`, `DualPdfPreview`, `ExerciseEditorModal`, `LatexEditor`, `StoragePolicyModal`); don't follow. Prop-drilling exception: `src/lib/grading/gradingStore.ts`, leaf grading components subscribe directly (15+ interdependent fields, justified in-file).
- **Styles**: in the component's own `<style>` block. No sibling `.css` file — existing ones are mid-migration away, not the model.
- **Known gaps** (don't reflexively fix; flag if touched): `npm run lint` runs `eslint .` but no eslint config exists anywhere, despite installed deps and CI running the step. `svelte-check` has 2 pre-existing errors — `d3-scale` types in `SubmissionHistogram.svelte`/`GradeDistribution.svelte`; `d3-scale` isn't in `frontend/package.json` at all, resolving only transitively via `layerchart` (latent breakage, not just missing types).

## Commands

| Command | What it does |
|---|---|
| `make dev-up` / `make dev-down` | docker compose: db + redis + backend |
| `make install` / `make install-frontend` | `uv pip install -e ".[dev]"` / `npm install` |
| `make migrate` / `make migrate-auto MSG="..."` | apply Alembic migrations / autogenerate one |
| `make lint` / `make lint-frontend` | `ruff check app && mypy app` / `npm run lint && npm run check` |
| `make test-backend` / `make test-frontend` / `make test` | pytest / vitest / both |
| `npm run test:e2e` | Playwright (not wired into `make`) |
| `npm run sri:verify` | subresource-integrity check (also in CI) |

Prefer `make` over hand-rolled `cd backend && ...`. `dev`/`build` run `predev`/`prebuild`, which fetch LaTeX/WASM assets — don't strip those.

## Token discipline

Tracked source is tiny (172 files in `frontend/src`, 44 in `backend/app`, ~1 MB); the working tree is ~2 GB of generated assets.

**Context**

- Never walk: `frontend/build/` (~500 MB), `frontend/node_modules/` (~350 MB), `frontend/static/core/busytex/` (~500 MB WASM), `frontend/.svelte-kit/`, `backend/__pycache__/`, `backend/blindgrade.db`, `latex-sample-project/`. Scope with `git ls-files` or explicit globs; never recurse from the root.
- Lockfiles grep-only: `frontend/package-lock.json` (7051 lines), `backend/uv.lock` (1652). Never read whole.
- `frontend/static/latex-assets/` = build-time `cp -r` of `backend/latex-assets/`; both committed. Edit the backend copy — reading both is duplicate context.
- Slice big files (grep to the symbol, then Read with `offset`/`limit`): `routes/exam/[id]/+page.svelte` 1266, `routes/exercises/+page.svelte` 1265, `routes/exam/[id]/scan/+page.svelte` 1036, `lib/db/dbEncryption.ts` 649, `routes/exam/new/+page.svelte` 618, `lib/components/grading/ScanCanvasViewer.svelte` 604.
- Narrow commands while iterating: `pytest tests/test_auth.py -q`, `npx vitest run <file>`, `npx svelte-check --threshold error` (plain `npm run check` buries the 2 real errors under ~106 CSS warnings). Full `make` targets once at the end — see "Validate before done".
- `npm install` fires `postinstall`, re-downloading busytex. Don't reinstall casually.
- Delegate wide searches to subagents; report conclusions, not file dumps.
- No verification-by-reread — Edit/Write error out on failure.

**Output**

- Caveman style, level `full` (`caveman` skill; `/caveman full` re-arms, `/caveman off` disables): drop articles, filler, hedging, pleasantries; fragments fine. Identifiers, commands, numbers, exact error strings stay verbatim. Never compress negations (not/never/only/except), security warnings, irreversible-action confirmations, or ordered multi-step instructions — plain prose there.
- Persisted prose stays normal English: code, comments, commits, docs, PR/issue text, memory files.
- No progress narration — fire tool calls directly. Text before a call only to warn about something destructive or resolve a real ambiguity.
- No code echo — reference `file:line` instead of pasting what the tool result already showed.

## Deployment

Frontend → **Cloudflare Pages** via git integration (build `npm run build` in `frontend/`, output `frontend/build/`). Origins `examance.pages.dev` plus a custom domain under `valentin-herrmann.com`, both CORS-allowed. No `wrangler.toml` or CF deploy step in-repo — dashboard-managed. Backend hosting isn't declared in-repo; don't assume where it runs.

Response headers come from `frontend/static/_headers`, which is a **template**: `npm run build` runs `scripts/generate-csp-headers.mjs`, which replaces the `__INLINE_SCRIPT_HASHES__` token in `script-src` with the SHA-256 of every inline script in `build/**/*.html`. Never hard-code a `sha256-` literal there — SvelteKit's inline bootstrap embeds the content-hashed entry chunk filenames, so its hash changes with any bundle change (including a dependency or Node version difference between your machine and the Pages build image) and a pinned hash takes the deployed app down with "Executing inline script violates the following Content Security Policy directive". `tests/cspHeaders.test.ts` guards this.

The policy is `script-src 'self'` with no CDN allowances: third-party assets (e.g. the pdf.js worker, see `src/lib/pdf/pdfjs.ts`) must be bundled and served from our own origin — required by the CSP and by the "no third-party transfer" claims in `docs/`.

## Multiple Choice (MC) Data Model

- **MC Question**: An individual `Exercise` / `ExerciseRecord` (`question_type: mc|sc|tf`, `correct_answers` JSON / `options` & `correctAnswers` arrays, `penalty`). Reuses the standard `exercise_group_id` + `variant_key` mechanism for variants.
- **MC Group (`\McExercise{a}{b}{c}`)**: A per-exam layout container (`ExamMcGroup` / `ExamMcGroupRecord`, 2–4 sub-items) linking member exercises via `ExamExercise.mc_group_id` and `sub_index`. Rendered into a single `\begin{Aufgabe}` by `format_mc_group_latex()`.
- **Grading & Statistics Invariant**: Grading and statistics are strictly per-question (`exerciseId`), treating `ExamMcGroup` solely as LaTeX rendering and layout metadata.

## Environment

`backend/.env.example` → `backend/.env`. Postgres + Redis via `docker-compose.yml`. `CORS_ALLOWED_ORIGINS` defaults to `http://localhost:5173` + `https://examance.pages.dev`, plus `CORS_ALLOWED_ORIGIN_REGEX` covering `*.valentin-herrmann.com` and `*.examance.pages.dev` preview subdomains. In development (`ENVIRONMENT=development`), `effective_cors_origin_regex` dynamically allows arbitrary loopback/localhost ports. No wildcard fallback; an empty list is a hard startup error (`require_cors_origins`, `backend/app/config.py`). Override explicitly for any other origin.

## Standing instructions
- **Prefer cheaper models** for mechanical or well-defined work; aggressively hand-off work to cheaper models; expensive models are on a tight budget! Escalate only when reasoning complexity really demands it.
- **Only basic verification, dont run unittests**: Extensive testing will be done by a human.
- **Security/privacy first**: client-side encryption-at-rest, GDPR-regulated data. Call out any change touching auth, crypto, or retention — read `docs/data_flow_and_security.md` and `docs/breach_response_checklist.md` first.
- **No secrets in commits**: never commit `backend/.env` or real secret values. `backend/.env.example` is a template.
- **Dep managers**: `uv` backend, `npm` frontend. No pip, poetry, yarn.
- **Local mode is the default** for exercise/exam management — don't default to server endpoints when local-only paths exist.
- Mind WASM/Argon2 asset resolution (`busytex.wasm`, `argon2.wasm`) in frontend bundling config.
- **busytex local-compile quirks** (`frontend/src/lib/latex/compiler.ts`/`compiler.worker.ts`): (1) first-ever local compile in a cold browser session can throw spurious `File 'X.sty' not found` errors (e.g. `ulem.sty`) while `texlive-extra` is still downloading/indexing — self-resolves on retry once cached, not a packaging bug. (2) Local (WASM XeLaTeX) compiles can silently drop exercise content that the same source compiles fine on the server — `compiler.worker.ts` only reports failure when the engine itself reports `!success`, so a non-fatal LaTeX error mid-document (e.g. an unavailable package/macro used only inside an exercise body) can produce a PDF that's missing content without surfacing an error. Root cause not yet isolated — needs the browser console log from a local compile to identify the failing package/macro.
- Don't run non-terminating npm commands (dev servers, watch mode) unless asked.
- If you find out something, which should be known for future agent-sessions (e.g. structural or constraints), add it to CLAUDE.MD but do no clutter it!
- **NEVER USE WRITING GIT COMMANDS!** (like commit, push, branch, ...)
- **Following mode strictly**: Never edit files in planning mode!
