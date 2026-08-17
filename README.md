# Examance

Privacy-first, zero-knowledge-encrypted anonymous exam grading. Teachers author LaTeX exams, print QR-coded booklets, scan and grade submissions against a pseudonym rather than a name, and get class-level analytics — all with student identity, scans and grading annotations encrypted client-side before they ever reach a server (or without a server at all, in the default local-only mode). Repo name `BlindGrade` is legacy; the product is Examance.

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
| `frontend/` | SvelteKit 2.5 (Svelte 4) static app, client-side crypto, IndexedDB |
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

**Pitch** — what it does and why, with current screenshots:
* [Concept Pitch](docs/concept_pitch.md) — long-form doc · [slides PDF](docs/concept_pitch.pdf) — same content as a presentation deck ([Marp](https://marp.app) source: `docs/concept_pitch_slides.md`, rebuild with `npx @marp-team/marp-cli --allow-local-files docs/concept_pitch_slides.md -o docs/concept_pitch.pdf`)

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

