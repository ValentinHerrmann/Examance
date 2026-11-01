# Examance (repo: BlindGrade)

> Start every response with "Vale". Tripwire: if it stops, this file stopped being read.

Examance = product name. "BlindGrade" = old name, still the repo name and some internal identifiers (DB user, default CORS origin). Legacy, not bugs — don't "fix".

Privacy-first, zero-knowledge-encrypted anonymous exam grading. LaTeX exams, QR-decoded pseudonymous submissions, canvas-annotation grading, analytics. Client-side encryption at rest: Argon2id + HKDF-SHA-256 + AES-256-GCM (`docs/data_flow_and_security.md`).

Storage modes (`lib/stores/storagePolicy.ts`, `docs/dev/storage_modes.md`, issue #47): every session is a server-account session (the `all-local` mode and the passphrase login were discontinued). Exams/exercises always live on the server; the mode only decides where grading results live: `all-server` or `hybrid` (results only in this browser, IndexedDB). **The mode belongs to the account** (`teachers.storage_mode`, nullable, no default; first sign-in must choose in the non-dismissible settings modal) and comes with the account's capabilities (`GET /user/capabilities`, `backend/app/services/capabilities.py`): render mode/feature options from `stores/capabilities.ts`, never from hard-coded lists. Three per-account admin switches are enforced (issues #53, #65): `server_results` (whether `all-server` is allowed), `server_latex` and `exercise_sharing`; compile sites pick their engine through `effectiveLatexCompilation()`, never the raw preference. Accounts come from an admin invitation, the CLI/bootstrap, or self-registration (always available): verify e-mail, set password, then admin approval unless the domain is on the always-allowed list (`backend/app/services/registration.py`, `docs/account_creation_and_management.md`). Switching is a **fluent move** of the results (`services/resultsMover.ts`: idempotent per-exam upserts, verify, then compare-and-set the mode, then keep/delete the old copy). `commitStorageMode(mode, token)` is armed only by `lib/db/workspace.ts`; after every unlock call `openWorkspace()` (owner binding + mode load; `needs-choice`/blocked states keep routes unmounted).

**Admins manage users and the server only** (issue #58): every teaching endpoint depends on `get_teaching_teacher` (`403 ERR_TEACHER_ROLE_REQUIRED`), `openWorkspace()` returns `admin` without touching the workspace, the root layout keeps admins on `isAdminPath()` routes, and `cli.py set-role` changes a role.

## Where things live

- `backend/` — FastAPI + SQLAlchemy + Alembic. Conventions, auth/data-key rules, backend gotchas: `backend/CLAUDE.md`.
- `frontend/` — SvelteKit 3 on **Svelte 5 (runes only)**. Design system, responsive rules, i18n, MC data model, LaTeX resources, frontend gotchas: `frontend/CLAUDE.md`.
- `docs/` — product, legal and deployment docs. Pitch decks/posters (`docs/pitches/`, `docs/posters/`) use real screenshots from the scripted demo instance in `docs/demo-instance/`. Developer deep-dives, read on demand: `docs/dev/omr.md` (MC detection), `docs/dev/latex_packages.md` (LaTeX package levels and conflict rules), `docs/dev/training_donation.md`, `docs/dev/ci_and_audit.md`, `docs/dev/build_and_csp.md`, `docs/dev/storage_partitions.md` (scan file storage, backups), `docs/dev/maintenance_mode.md` (maintenance windows, deploy freeze, maintenance backups), `docs/dev/latex.md` (exercise structure, resources, compile errors, browser engine), `docs/dev/mc_model.md` (MC and exam data model), `docs/dev/ui_shell.md` (shell, navbar, overview lists, small features), `docs/dev/exercise_sharing.md` (copies, resync, contributions), `docs/dev/session_key_wrap.md` (session keys sealed per tab across reloads). Operators: `docs/hosting.md` (any installation: stack, settings, frontend hosting, updates, rollback), `docs/deployment.md` (the maintainer's GitHub Actions pipeline on top of it), `docs/backup_and_restore.md` (restores).
- `docs/` is also the documentation site (VitePress, issue #174): `docs/.vitepress/config.mts` holds the sidebar (add a new page there), `docs/user/` the user guide (for teachers: no repo paths, sources or build steps; they belong on developer pages) with a German copy in `docs/de/user/` (same file names and `{#anchors}`; the in-app help links its sections, see `docs/dev/ui_shell.md`; screenshots in `docs/screenshots/`), `docs/.vitepress/markdown.ts` the GitHub-to-site conversions and the files served by the site; production and previews on Cloudflare Pages (`release` = production, settings in `docs/deployment.md`), backup on GitHub Pages from `release` (`.github/workflows/docs.yml`, `DOCS_BASE=/Examance/`), and CI fails on dead internal links. Build with `cd docs && npm run docs:build`.
- `backend/latex-assets/` is the single copy of the bundled LaTeX assets: Tectonic reads it directly and the browser engine fetches it from the authenticated `GET /api/v1/latex-assets/*` (`lib/latex/assets.ts`), so both compile with identical files.

## Commands

| Command | What it does |
|---|---|
| `make dev-up` / `make dev-down` | docker compose: db + redis + backend |
| `make install` / `make install-frontend` | `uv pip install -e ".[dev]"` / `npm install` |
| `make migrate` / `make migrate-auto MSG="..."` | apply Alembic migrations / autogenerate one |
| `make lint` / `make lint-frontend` | `ruff check app && mypy app` / `npm run lint && npm run check` |
| `make test-backend` / `make test-frontend` / `make test` | pytest / vitest / both |
| `npm run test:e2e` | Playwright suite (not wired into `make`; CI runs only the layout and a11y specs on three devices) |
| `npm run sri:verify` | subresource-integrity check (also in CI) |

Prefer `make` over hand-rolled `cd backend && ...`. Deps: `uv` backend, `npm` frontend; no pip, poetry, yarn. mypy needs the dev extras (see `backend/CLAUDE.md`).

## Token discipline

- Never walk: `frontend/build/`, `frontend/node_modules/`, `frontend/static/core/busytex/` (~500 MB WASM), `frontend/.svelte-kit/`, `docs/node_modules/`, `docs/.vitepress/{cache,dist}/`, `backend/blindgrade.db`, `latex-sample-project/`. Scope with `git ls-files` or explicit globs; never recurse from the root.
- Lockfiles (`frontend/package-lock.json`, `backend/uv.lock`) are grep-only.
- Files over ~600 lines (e.g. `routes/exam/[id]/+page.svelte`, `routes/exam/[id]/scan/+page.svelte`, `routes/exam/new/+page.svelte`, `routes/exercises/+page.svelte`, `ScanCanvasViewer.svelte`): grep to the symbol, then Read with `offset`/`limit`.
- Narrow commands while iterating: `pytest tests/test_auth.py -q`, `npx vitest run <file>`, `npx svelte-check --threshold error` (plain `npm run check` buries real errors under CSS warnings). Full `make` targets once at the end.

## Deployment (rules only; full picture in `docs/deployment.md`)

- Two independent stacks, production and preview, on the same version. Root `/VERSION` (bare semver) is the single source of truth; `frontend/package.json` and `backend/pyproject.toml` versions are **not** part of the chain, don't "sync" them. A differing major version means frontend and backend are incompatible.
- Release workflow triggers on `published`, **not** `created` (`created` also fires on draft-save).
- **One shared preview stack.** The newest non-draft PR push wins for both frontend and backend, so testing PR A after PR B was pushed means testing B. The footer version carries the PR number; check it before debugging. Previews also show a "Preview #PR" corner ribbon (`PreviewBanner.svelte`).
- Frontend is Cloudflare Pages (builds only `release` and `preview`); backend is Docker behind Caddy on one SSH host. Migrations run **forward only** on deploy; rolling back an image does not undo them.
- CSP: never hard-code a `sha256-` literal in `frontend/static/_headers` (it is a template filled at build), and never widen `script-src` to silence a CSP error. Details and diagnosis: `docs/dev/build_and_csp.md`.

## How we build (defaults; the 2026 review had to clean up every one of these)

- **Reuse, extend, merge: never implement from scratch what already exists.** Before writing a helper, component, dialog, endpoint or service:
  1. **Search**: the reuse maps ("One component per job" in `frontend/CLAUDE.md`, the services in `backend/CLAUDE.md`), `git grep` for the job's verbs and nouns, the nearest `lib/<feature>/` and `services/`.
  2. **Reuse** it as is when it does the job.
  3. **Extend** it with a prop, option or parameter when it nearly does; never copy it and edit the copy.
  4. **Merge** when two pieces are very similar (same job, small differences: two dialogs, two grids, two builders, two save paths): fold them into one with an option, move every caller and delete the other, in the same PR or, outside the scope, as a filed issue.
  5. **Write new code** only when nothing comparable exists, and add it to the reuse map.
  A second implementation of the same job is a bug, not a pattern (this PR merged two export dialogs, two score grids, two exam preambles and three code-entry steps).
- **One flow per user task.** Replacing a flow deletes the old one in the same PR; old URLs only redirect. Deprecated code names when it goes.
- **Delete as you go.** Exports, i18n keys, endpoints and files that a change orphans leave in the same PR.
- **Small files.** No route or component grows past ~600 lines: move a whole flow into a component opened through an exported `open()`, when you touch it, not in a big bang later.
- **Fixes before cleanups, refactors keep behaviour.** Security and data-loss fixes come first; a refactor leaves the OpenAPI document unchanged unless the endpoint is the point.
- **Every bug fix adds a regression test** at the lowest level that reproduces it.
- **Every change passes what CI checks**: ruff, mypy, `svelte-check`, eslint, the OpenAPI drift check, SonarCloud without new issues. Answer CodeQL with a fix or a dismissal reason, never with an unread autofix. Generated files (`docs/openapi.json`, `static/example-data/`) are regenerated, never hand-edited.
- **One PR, one purpose.** Cleanup found outside the scope becomes an issue; a refactor across many files gets a short plan in `docs/dev/` first.

## Standing instructions

- **Prefer cheaper models** for mechanical or well-defined work and hand it off aggressively (wide searches go to subagents, which report conclusions rather than file dumps). Expensive models are on a tight budget; escalate only when reasoning complexity really demands it.
- **Only basic verification, don't run unit tests.** Extensive testing is done by a human. Don't run non-terminating npm commands (dev servers, watch mode) unless asked.
- **Security/privacy first**: client-side encryption at rest, GDPR-regulated data. Call out any change touching auth, crypto or retention, and read `docs/data_flow_and_security.md` and `docs/breach_response_checklist.md` first.
- **No secrets in commits**: never commit `backend/.env` or real secret values. `backend/.env.example` is a template.
- **Results follow the account's mode**: route students/submissions/scores through their repositories (`resultsAreLocal()` = hybrid); never write results to the other side directly outside `resultsMover.ts`.
- **NEVER USE WRITING GIT COMMANDS when running on a computer** (commit, push, branch, …). Only allowed in cloud mode.
- **Follow Claude-Code mode strictly**: never edit files in planning mode, don't even ask. Just make a PLAN in plan mode.
- Keep in-app help and documentation up to date.
- **PR titles are user-facing**: GitHub generates the release notes from them and the app shows those notes to teachers after an update (previews show the PR title, issue #94). Write each title as what changes for users, in plain language a non-technical teacher understands ("Export exams and exercise libraries as ZIP including graded PDFs, statistical summary, LaTeX code, etc.", not "Add ZIP export service"); no jargon or file names; a trailing "(#123)" for the solved issue is fine. A title longer than developers are comfortable with is fine if it makes the release note understandable and detailed: say what the user gets (which contents, which options), not just the feature name.
- **Comments and docstrings: one line each** (the editor wraps; keep multi-line only where line breaks carry structure: lists, tables, code). Say why, not what; keep invariants and "never" rules. Longer explanations go to `docs/dev/` or the nearest `CLAUDE.md`.
- If you learn something future agent sessions should know (structure, constraints), add it to the closest `CLAUDE.md` or `docs/dev/` file, but don't clutter. Persisted prose (code, comments, commits, docs, PRs, memory) is normal English, not caveman.
