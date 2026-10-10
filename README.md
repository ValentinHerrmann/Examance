# Examance

Privacy-first, zero-knowledge-encrypted anonymous exam grading. Teachers author LaTeX exams, print QR-coded booklets, scan and grade submissions against a pseudonym rather than a name, and get class-level analytics — all with student identity, scans and grading annotations encrypted client-side before they ever reach a server (in `all-server` mode as ciphertext on the server; in `hybrid` mode grading results stay only in the teacher's browser). Every user signs in with a server account. Repo name `BlindGrade` is legacy; the product is Examance.

[Concept Pitch](docs/concept_pitch.md) ([slides PDF](docs/concept_pitch.pdf)) — problem, feature walkthrough with current screenshots, security modes. (Superseded [slide deck](docs/BlindGrade_Presentation.pdf) / [poster](docs/BlindGrade_Poster.png) kept for reference — pre-rename, AI-generated mockups, not current UI.)

## Quickstart

```bash
make install            # backend: uv pip install -e ".[dev]"
make install-frontend   # frontend: npm install
make dev-up             # docker compose: postgres + redis + backend
make migrate            # apply Alembic migrations
cd frontend && npm run dev
```

Backend API at `http://localhost:8000/api/docs`, frontend at `http://localhost:5173`. Full architecture and command reference: [`CLAUDE.md`](CLAUDE.md).

## Repository layout

| Path | What |
|---|---|
| `backend/` | FastAPI + SQLAlchemy + PostgreSQL API, Python 3.12, `uv`-managed |
| `frontend/` | SvelteKit 3 (Svelte 5) static app, client-side crypto, IndexedDB |
| `deploy/` | Production/preview `docker-compose` and env templates |
| `docs/` | Architecture, API, and legal/compliance documentation (this index) |
| `.github/workflows/` | CI, release deploy, preview deploy |

## `make` targets

| Command | What it does |
|---|---|
| `make dev-up` / `make dev-down` | docker compose: db + redis + backend |
| `make install` / `make install-frontend` | backend / frontend dependencies |
| `make migrate` / `make migrate-auto MSG="..."` | apply / autogenerate Alembic migrations |
| `make lint` / `make lint-frontend` | ruff + mypy / eslint + svelte-check |
| `make test-backend` / `make test-frontend` / `make test` | pytest / vitest / both |
| `make retention-dry` | dry-run the GDPR retention job, no DB writes |

## Documentation

**Pitch & posters** — current audience-specific materials, using the actual app and current privacy model:
* [Examance pitch index](docs/concept_pitch.md) — overview and links to all current versions
* [Computer Science beta pitch](docs/pitches/examance-beta-cs.pdf) — for computer science teachers joining the beta
* [Teacher pitch](docs/pitches/examance-teachers.pdf) — for general classroom adoption
* [Administration pitch](docs/pitches/examance-administration.pdf) — for school leadership and governance
* [Computer Science beta poster](docs/posters/examance-beta-cs.pdf)
* [Teacher poster](docs/posters/examance-teachers.pdf)
* [Administration poster](docs/posters/examance-administration.pdf)

Sources are [Marp](https://marp.app) Markdown sharing one theme that mirrors the app's design tokens. Render from the source's directory with `npx @marp-team/marp-cli <source.md> --pdf --html --allow-local-files --theme-set ../pitches/examance-theme.css --theme-set ../posters/examance-poster.css -o <source.pdf>` (keep the input file first: `--theme-set` takes several values).

**Developer** — architecture, API, accounts:
* [Data Flow, Encryption-at-Rest & DevTools Security Architecture](docs/data_flow_and_security.md) — client-side crypto, storage modes, session hygiene
* [REST API Reference](docs/api_reference.md) — endpoints, auth, `/api/v1` schemas
* [Third-Party Dependencies & SRI Manifest](docs/THIRD_PARTY_LICENSES.md) — licenses, WASM integrity status
* [Account Creation & Management](docs/account_creation_and_management.md) — admin bootstrap, password reset, CLI

**Operator** — deployment:
* [Deployment](docs/deployment.md) — production/preview topology, release flow, versioning, secrets, runbook

**Legal & Compliance (DSGVO)** — read the audit first, it links the rest:
* [Legal Audit — DSGVO / BDSG / Bavarian school law](docs/legal_audit_dsgvo.md) — **start here**; findings, role model, what's fixed vs. still open
* [Record of Processing Activities (Art. 30)](docs/records_of_processing_art30.md)
* [Data Protection Impact Assessment (Art. 35)](docs/dpia_art35.md)
* [Data Processing Agreement Template (Art. 28)](docs/DPA_template.md)
* [Breach Response Checklist (Art. 33/34)](docs/breach_response_checklist.md)

> Several of the legal documents ship with placeholders that must be completed before a school
> deployment — see [§6 of the legal audit](docs/legal_audit_dsgvo.md#6-what-remains-open).

