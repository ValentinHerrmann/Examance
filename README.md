# Examance

Privacy-first anonymous exam grading. Teachers write LaTeX exams, print QR-coded sheets, scan and grade the submissions against a pseudonym rather than a name, and analyse the results. Student identities, scans and annotations are encrypted in the browser before they reach a server. The repository name `BlindGrade` is legacy; the product is Examance.

## Documentation

**<https://valentinherrmann.github.io/Examance/>**, built from `docs/` for the latest release:

- [User guide](https://valentinherrmann.github.io/Examance/user/) and [info material](https://valentinherrmann.github.io/Examance/user/material) (slide decks and posters, German)
- [Host Examance](https://valentinherrmann.github.io/Examance/hosting) on your own server
- [Develop](https://valentinherrmann.github.io/Examance/data_flow_and_security): architecture, encryption, API, data model
- [Legal and compliance](https://valentinherrmann.github.io/Examance/legal_audit_dsgvo) (DSGVO): audit, records of processing, DPIA, DPA template, breach response

## Development quickstart

```bash
make install            # backend dependencies (uv)
make install-frontend   # frontend dependencies (npm)
make dev-up             # docker compose: postgres + redis + backend
make migrate            # apply database migrations
cd frontend && npm run dev
```

API docs at `http://localhost:8000/api/docs`, frontend at `http://localhost:5173`. All commands and conventions: [`CLAUDE.md`](CLAUDE.md).

| Path | What |
|---|---|
| `backend/` | FastAPI + SQLAlchemy + PostgreSQL API |
| `frontend/` | SvelteKit (Svelte 5) static app, client-side crypto |
| `deploy/` | `docker compose` stack and env templates |
| `docs/` | Documentation site sources (VitePress) |
