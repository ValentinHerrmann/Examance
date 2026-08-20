# Examance (repo: BlindGrade)

> Start every response with "Vale". Tripwire: if it stops, this file stopped being read.

Examance = product name. "BlindGrade" = old name, still the repo name and some internal identifiers (DB user, default CORS origin). Legacy, not bugs — don't "fix".

Privacy-first, zero-knowledge-encrypted anonymous exam grading. LaTeX exams, QR-decoded pseudonymous submissions, canvas-annotation grading, analytics. Client-side encryption at rest: Argon2id + HKDF-SHA-256 + AES-256-GCM (`docs/data_flow_and_security.md`). Storage modes (`lib/stores/storagePolicy.ts`): `all-local` (IndexedDB/Dexie, default), `all-server`, `hybrid` (exercises/exams on server, student identity/submissions local).

## Architecture

**Backend** `backend/` — Python 3.12, FastAPI async, SQLAlchemy 2.0, Alembic, PostgreSQL (asyncpg; psycopg2 sync fallback), Redis (rate limiting), argon2-cffi, PyJWT, slowapi, Click CLI. Deps: `uv`.

- `app/main.py` → `create_app()`. Routers `auth, compile, exams, exercises, students, submissions, admin, user` under `/api/v1`; `/api/health`; docs `/api/docs`.
- `app/{config,database,dependencies,cli}.py` + `middleware,models,routers,schemas,services`.
- Tests `backend/tests/`: pytest + pytest-asyncio, aiosqlite in-memory, httpx AsyncClient.
- Ruff `select = E,F,I,UP,S,B` (S=security, B=bugbear), mypy `strict=true`. Lint is a security control here — keep new code passing both.

**Frontend** `frontend/` — SvelteKit 2.5 on **Svelte 4 (not 5)**, TypeScript, Vite 5, Tailwind v4, `adapter-static` → `frontend/build/`. `argon2-browser`, `dexie` (IndexedDB, primary encrypted store in local mode), `pdf-lib`/`pdfjs-dist`, `zxing-wasm` (QR decode) / `qrcode` (generate), `texlyre-busytex` (WASM LaTeX via Tectonic).

- `src/lib/{analytics,api,archive,components,crypto,db,exam,exercise-library,gdpr,grading,hardware,latex,pdf,repositories,services,stores,utils,workers}`; `src/routes/{admin,analytics,exam,exercises,forgot-password,legal,reset-password,settings,unlock}`.
- **Components**: new ones → `src/lib/components/<feature>/`. Nine legacy ones sit loose at `components/` root (`ConfirmDialog`, `DualPdfPreview`, `ExerciseEditorModal`, `GradingKeyEditor`, `LatexEditor`, `LatexViewer`, `SessionTimeoutWarning`, `StoragePolicyModal`, `ZoomableImage`) — leftovers, don't copy. Routes hold data-loading, handlers, session state; components hold markup. Wire with callback props (`onAction={handler}`, `bind:value`), **not** `createEventDispatcher` — 5 legacy roots still use it (`ConfirmDialog`, `DualPdfPreview`, `ExerciseEditorModal`, `LatexEditor`, `StoragePolicyModal`); don't follow. Prop-drilling exception: `src/lib/grading/gradingStore.ts`, leaf grading components subscribe directly (15+ interdependent fields, justified in-file).
- **Styles**: in the component's own `<style>` block. No sibling `.css` file — existing ones are mid-migration away, not the model.
- **Known gaps** (don't reflexively fix; flag if touched): the 2 long-standing `svelte-check` errors for `d3-scale` types in `SubmissionHistogram.svelte`/`GradeDistribution.svelte` were a stale-install artefact — `npm install --ignore-scripts` pulled in the missing `@types/d3-scale` and they are gone (2026-08-19). `--ignore-scripts` is the safe way to reinstall: it skips the `postinstall` that re-downloads busytex. `svelte-check --threshold error` should now be clean; treat any error as new.

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

Full picture with diagrams: `docs/deployment.md`. Summary:

Two independent instances, production and preview, always on the same version. Root `/VERSION` (bare semver, no `v`) is the single source of truth — `frontend/package.json` and `backend/pyproject.toml` versions are **not** part of the chain, don't "sync" them. Prod version = `VERSION` verbatim; preview = `VERSION` + `-PR#<number> [<dd.MM.yyyy | HH:mm>]`, composed once in `deploy-preview.yml`'s `version` job and both used as the backend `APP_VERSION` build-arg and stamped into a `PREVIEW_VERSION` file committed onto the `preview` branch for `frontend/vite.config.ts` to read (Cloudflare Pages builds have no PR-number env var of their own). Status bar displays the backend version (source of truth for compatibility); PR links route to the PR. A differing major version means frontend and backend are incompatible.

- Release published (`deploy-release.yml`) → writes `VERSION` to the default branch, force-pushes to branch `release`, builds `ghcr.io/<owner>/examance-backend:<version>`, deploys over SSH. Trigger is `published`, **not** `created` — `created` also fires on draft-save.
- Non-draft PR (`deploy-preview.yml`) → force-pushes PR head to branch `preview`, builds `:sha-<sha>`, deploys to the preview stack. Draft PRs and fork PRs deploy nothing.

Frontend → **Cloudflare Pages** via git integration (build `npm run build` in `frontend/`, output `frontend/build/`), building **only** `release` (production) and `preview` (preview). Dashboard-managed, no `wrangler.toml` in-repo. Version reaches the bundle through Vite `define` (`__APP_VERSION__`, computed in `vite.config.ts` from `CF_PAGES_BRANCH`/`CF_PAGES_COMMIT_SHA`) and is shown in `StatusBar.svelte`, coloured by `compareVersions()` in `lib/stores/versionStore.ts`.

Backend → `deploy/docker-compose.deploy.yml` on one SSH host, two isolated stacks (`docker compose -p examance-prod` :8000, `-p examance-preview` :8001). Project names namespace containers *and* volumes, so preview never touches production data. The dev `docker-compose.yml` is a separate, dev-only file — its `retention-cron` is broken (busybox calling `docker exec`, hardcoded container name) but inert behind `profiles: [prod]`; the working one lives in the deploy file. Version is baked in via `--build-arg APP_VERSION` → `Settings.APP_VERSION` → `GET /api/health`, which returns `{"status": "ok", "version": ...}` unauthenticated by design. Migrations run **forward only** on deploy; rolling back an image does not undo them.

Response headers come from `frontend/static/_headers`, which is a **template**: `npm run build` runs `scripts/generate-csp-headers.mjs`, which replaces the `__INLINE_SCRIPT_HASHES__` token in `script-src` with the SHA-256 of every inline script in `build/**/*.html`. Never hard-code a `sha256-` literal there — SvelteKit's inline bootstrap embeds the content-hashed entry chunk filenames, so its hash changes with any bundle change (including a dependency or Node version difference between your machine and the Pages build image) and a pinned hash takes the deployed app down with "Executing inline script violates the following Content Security Policy directive". `tests/cspHeaders.test.ts` guards this.

The policy is `script-src 'self'` with no CDN allowances: third-party assets (e.g. the pdf.js worker, see `src/lib/pdf/pdfjs.ts`) must be bundled and served from our own origin — required by the CSP and by the "no third-party transfer" claims in `docs/`.

## i18n (German / English)

UI text lives in typed catalogs under `frontend/src/lib/i18n/`; the app ships German and
English with a `🌐` toggle in `StatusBar.svelte` and a radio section in `SettingsForm.svelte`.

- `de/<ns>.ts` is the **source of truth** (`export const <ns> = {...} as const`).
  `en/<ns>.ts` is annotated `Translations['<ns>']`, so a missing or misspelled key is a
  `svelte-check` error. `types.ts` widens the `as const` literals back to `string` — German
  pins the key *structure*, not the wording. Both are aggregated by `de/index.ts` / `en/index.ts`;
  a new namespace must be added to both.
- Markup: `{$t("ns.key")}`, `{$t("ns.key", { name })}`. Plain `.ts`, `alert`/`confirm`/`prompt`:
  `translate("ns.key")`. Runtime-composed keys: `tOptional` / `translateOptional`.
  Dates and numbers: `$fmt.date` / `$fmt.number` / `$fmt.percent` from `lib/utils/format.ts`.
- Locale is `bg_locale` in `safeLocalStorage`, detected as saved → `navigator.language` → `en`.
  Missing key falls back to German, then to the key itself. Interpolation only — no ICU plurals.
- Backend errors are localized **client-side** by the `code` the API sends alongside its English
  `detail` (`errors.code.<CODE>`, applied in `lib/api/client.ts`); `err.message` stays the fallback.
  No backend or `Teacher` model changes.
- **Exam/PDF output is deliberately NOT translated** — `Schulaufgabe.sty` captions,
  `\begin{Aufgabe}`, `\Loesung*`, the MC rubric prose, and German seed defaults
  (`testart`/`fach`/`title`) are exam content and a stable macro API. `routes/exam/new` keeps
  `toLocaleDateString("de-DE")` because that value is printed in the PDF.
- Legal pages: German is legally binding (§ 5 DDG, Art. 12 DSGVO). `en/legal.ts` holds the
  German text as a placeholder — **never** machine-translate it.
- `tests/locale.test.ts` guards detection, persistence, interpolation and de/en key parity.

## Multiple Choice (MC) Data Model

- **MC Question**: An individual `Exercise` / `ExerciseRecord` (`question_type: mc|sc|tf`, `correct_answers` JSON / `options` & `correctAnswers` arrays, `penalty`). Reuses the standard `exercise_group_id` + `variant_key` mechanism for variants.
- **MC Group (`\McExercise{a}{b}{c}`)**: A per-exam layout container (`ExamMcGroup` / `ExamMcGroupRecord`, 2–4 sub-items) linking member exercises via `ExamExercise.mc_group_id` and `sub_index`. Rendered into a single `\begin{Aufgabe}` by `format_mc_group_latex()`.
- **Grading & Statistics Invariant**: Grading and statistics are strictly per-question (`exerciseId`), treating `ExamMcGroup` solely as LaTeX rendering and layout metadata.
- **Group membership lives on the junction row**, not on the exercise: `ExamExercise.mc_group_id`/`sub_index` server-side, `examExercises.mcGroupId`/`subIndex` in Dexie. The Dexie primary key is `[examId+exerciseId]`, so **any `examExercises.put`/`bulkPut` that omits those two fields silently dissolves the group** — the group then renders empty and its members reappear as standalone exercises. Always merge onto the stored record or carry `mc_group_id`/`sub_index` through from the API response.
- Group ids are **client-chosen and stable** (like exam/exercise ids); `_persist_mc_groups` keeps them and answers 409 on collision. `exam_exercises.mc_group_id` is `ON DELETE SET NULL` — dissolving a group must never delete its members' exam links.
- `PATCH /exams/{id}` replaces `mc_groups` and `exercise_links` wholesale. An exercise may appear **once** in `exercise_links` (under its group if grouped) — `(exam_id, exercise_id)` is the primary key. `exam/[id]/+page.svelte`'s `buildExamLinkPayload()` is the single builder for both the Dexie records and that payload; don't hand-roll a second one.
- `examItems` (the exam page's item order) is view state, rebuilt on load from the persisted `order_index` values via `buildExamItems()`. Group members share their group's `order_index`.

## LaTeX Resource Files

Teacher-uploaded files an exercise's LaTeX references (`\includegraphics{figure.png}`, `\input{data.tex}`). Any file type is allowed **except SVG** (refused with a convert-to-PDF hint — `frontend/src/lib/latex/resources.ts`, mirrored in `backend/app/services/latex_resources.py`; keep the two in sync).

- Attached **per exercise**, referenced by **flat sanitized filename** — files are written next to `main.tex` in both engines, never in a subdirectory. Names that collide with a bundled `latex-assets` file (including the worker's flattened `sty/x.sty` → `x.sty`) are rejected at upload.
- Limits: 5 MB per file, 25 MB per exercise, 20 MB / 30 files per compile request; `BODY_LIMIT_COMPILE` is 28 MB and `BODY_LIMIT_RESOURCE` 7 MB.
- Storage: Dexie table `exerciseResources` (v8), bytes AES-256-GCM encrypted; server table `exercise_resources`, bytes **plaintext** — same treatment as `exercises.latex_body`, since Tectonic cannot read ciphertext.
- The editor stages files under a throwaway id (`ExerciseResourcePanel` gets a staging id, never the exercise id) and `exerciseResourceRepository.commit()` moves the staged set onto the exercise on save — that is what makes uploading and previewing work before an exercise exists. Cancel discards. The staged set is authoritative on commit: files removed while editing are deleted server-side too.
- Local compile: `compiler.ts` → worker `additionalFiles`. Server compile sends `resource_exercise_ids` for saved exercises (server reads its own rows) and inline base64 only for staged/local-only files. `POST /exams/{id}/compile` always reads the rows from the DB.
- Two exercises with *different* files under the same name is a hard error before compiling (`mergeResources`); identical bytes are deduped.
- Resource API calls pass `silentError` and report in the panel — a 404 for an exercise the server has never seen must not raise the global toast.
- A missing graphic does not fail XeLaTeX. The worker reports `missingGraphics` and callers surface it — do not treat a successful compile as proof the figures rendered.

## Gotchas worth knowing

- **A swallowed API error still opens the global HTTP error modal.** `api.*` calls `httpErrorStore.showError()` before throwing, so a `try { … } catch {}` around a best-effort request produces a dialog for a failure nobody handles. Pass `silentError: true` on anything with a local fallback, an offline-queue fallback, or an expected 409.
- **`POST /exams` and `POST /exercises` are create-only** — a known id answers 409. Re-queuing that POST can never succeed; update with `PATCH` instead.
- **`POST /auth/refresh` rotates the refresh token and treats a second use of a revoked one as theft**, revoking every session the teacher has. `client.ts` therefore both deduplicates concurrent refreshes and, for `REFRESH_GRACE_MS` after a successful one, retries a 401 instead of refreshing again. Do not remove either guard.
- **A 500 has to carry CORS headers itself.** The global handler in `app/main.py` runs in `ServerErrorMiddleware`, outside `CORSMiddleware`, so an unhandled exception reaches the browser as "No 'Access-Control-Allow-Origin' header" and the real fault is invisible. The handler echoes an allowlisted `Origin` for that reason (`is_allowed_origin`, `app/middleware/cors.py`) — do not remove it.
- **`ci.yml` installs unpinned deps.** `uv pip install -e ".[dev]"` and `npm ci` both resolve to the newest allowed versions, so a new mypy or a fresh advisory turns CI red without a code change. The frontend `npm audit` gate is deliberately scoped to `--omit=dev`: the build toolchain (Vite/SvelteKit/Svelte 4) carries advisories that only a Svelte 5 + Vite 7 migration would clear, and none of it ships to a browser. `@sveltejs/kit` sits in `devDependencies` for that reason — that is where the SvelteKit template puts it too.

- **The same failure mode exists one layer out, at nginx, and the app can't fix it.** `/compile/latex` and `/exams/{id}/compile` are the only endpoints that legitimately run tens of seconds (Tectonic, up to `COMPILE_TIMEOUT_SECONDS`). If nginx's `proxy_read_timeout` (60s default) is shorter, nginx serves its own bare 504 and drops the connection before the backend's own — CORS-header-carrying — timeout response is ready; the backend finishes moments later and logs a clean 504 nobody receives. Browser symptom is indistinguishable from a CORS misconfig, flaky (races transient host load), and stops reproducing on its own without anything being fixed. nginx is host-managed, not in this repo (`docs/deployment.md` §6) — its `proxy_read_timeout`/`proxy_send_timeout` must be set ≥ `COMPILE_TIMEOUT_SECONDS` + margin on the host; there is no code-side fix.
- **One shared preview stack.** `deploy-preview.yml` force-pushes the PR head to `preview`; the newest non-draft PR push wins for *both* frontend and backend. Testing PR A while PR B was pushed later means testing B. The status bar version carries the PR number — check it before debugging.

## Environment

`backend/.env.example` → `backend/.env`. Postgres + Redis via `docker-compose.yml`. `CORS_ALLOWED_ORIGINS` defaults to `http://localhost:5173` + `https://examance.pages.dev`, plus `CORS_ALLOWED_ORIGIN_REGEX` covering `*.valentin-herrmann.com` and `*.examance.pages.dev` preview subdomains. In development (`ENVIRONMENT=development`), `effective_cors_origin_regex` dynamically allows arbitrary loopback/localhost ports. No wildcard fallback; an empty list is a hard startup error (`require_cors_origins`, `backend/app/config.py`). Override explicitly for any other origin.

## Standing instructions
- **Prefer cheaper models** for mechanical or well-defined work; aggressively hand-off work to cheaper models; expensive models are on a tight budget! Escalate only when reasoning complexity really demands it.
- **Only basic verification, dont run unittests**: Extensive testing will be done by a human.
- **Security/privacy first**: client-side encryption-at-rest, GDPR-regulated data. Call out any change touching auth, crypto, or retention — read `docs/data_flow_and_security.md` and `docs/breach_response_checklist.md` first.
- **No secrets in commits**: never commit `backend/.env` or real secret values. `backend/.env.example` is a template.
- **Dep managers**: `uv` backend, `npm` frontend. No pip, poetry, yarn.
- **Local mode is the default** for exercise/exam management — don't default to server endpoints when `all-local` paths exist.
- Mind WASM/Argon2 asset resolution (`busytex.wasm`, `argon2.wasm`) in frontend bundling config.
- **busytex local-compile quirks** (`frontend/src/lib/latex/compiler.ts`/`compiler.worker.ts`): (1) first-ever local compile in a cold browser session can throw spurious `File 'X.sty' not found` errors (e.g. `ulem.sty`) while `texlive-extra` is still downloading/indexing — self-resolves on retry once cached, not a packaging bug. (2) Local (WASM XeLaTeX) compiles can silently drop exercise content that the same source compiles fine on the server — `compiler.worker.ts` only reports failure when the engine itself reports `!success`, so a non-fatal LaTeX error mid-document (e.g. an unavailable package/macro used only inside an exercise body) can produce a PDF that's missing content without surfacing an error. Root cause not yet isolated — needs the browser console log from a local compile to identify the failing package/macro.
- Don't run non-terminating npm commands (dev servers, watch mode) unless asked.
- If you find out something, which should be known for future agent-sessions (e.g. structural or constraints), add it to CLAUDE.MD but do no clutter it!
- **NEVER USE WRITING GIT COMMANDS!** (like commit, push, branch, ...)
- **Follow Claude-Code Mode strictly**: Never edit files in planning mode; do not even ask for it! Just make a PLAN in PLAN MODE!
