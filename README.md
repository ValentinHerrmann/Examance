<div align="center">

# Examance

Privacy-first anonymous exam grading. Teachers write LaTeX exams, print QR-coded sheets, scan and grade the submissions against a pseudonym rather than a name, and analyse the results. Student identities, scans and annotations are encrypted in the browser before they reach a server. Teacher select between end-to-end encrypted student data stored on the server or only their computer. 

<p align="center">
  <!-- Project -->
  <a href="https://github.com/ValentinHerrmann/Examance/releases"><img alt="Release" src="https://img.shields.io/github/v/release/ValentinHerrmann/Examance?color=6e40c9&labelColor=1f2937&logo=github&style=for-the-badge"></a>
  <a href="https://github.com/ValentinHerrmann/Examance/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/github/license/ValentinHerrmann/Examance?color=22c55e&labelColor=1f2937&style=for-the-badge"></a>

  
  <a href="https://github.com/ValentinHerrmann/Examance/issues"><img alt="Open issues" src="https://img.shields.io/github/issues/ValentinHerrmann/Examance?color=ef4444&labelColor=1f2937&style=for-the-badge"></a>
  <a href="https://github.com/ValentinHerrmann/Examance/pulls?q=is%3Apr+is%3Aclosed"><img alt="Closed PRs" src="https://img.shields.io/github/issues-pr-closed/ValentinHerrmann/Examance?color=8b5cf6&labelColor=1f2937&style=for-the-badge"></a>

  <a href="https://docs.examance.de/user/"><img alt="Languages" src="https://img.shields.io/badge/UI-Deutsch_%7C_English-0ea5e9?labelColor=1f2937&logo=googletranslate&logoColor=white&style=for-the-badge"></a>
  <a href="https://docs.examance.de/"><img alt="Docs site" src="https://img.shields.io/badge/Docs-docs.examance.de-3B82F6?labelColor=1f2937&logo=readthedocs&logoColor=white&style=for-the-badge"></a>
</p>


### Code Stats
<p align="center">
  <!-- Code size -->
  <a href="https://github.com/ValentinHerrmann/Examance"><img alt="Code statistics" src="https://raw.githubusercontent.com/ValentinHerrmann/Examance/badges/code-stats.svg" width="820"></a>
</p>
<p align="center">
  <!-- Project -->
  <a href="https://github.com/ValentinHerrmann/Examance/commits"><img alt="Last commit" src="https://img.shields.io/github/last-commit/ValentinHerrmann/Examance?color=0ea5e9&labelColor=1f2937&style=for-the-badge"></a>
  <a href="https://github.com/ValentinHerrmann/Examance/graphs/commit-activity"><img alt="Commit activity" src="https://img.shields.io/github/commit-activity/m/ValentinHerrmann/Examance?color=0ea5e9&labelColor=1f2937&style=for-the-badge"></a>
  <a href="https://github.com/ValentinHerrmann/Examance/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/ValentinHerrmann/Examance?color=eab308&labelColor=1f2937&logo=github&style=for-the-badge"></a>
  <a href="https://github.com/ValentinHerrmann/Examance/graphs/contributors"><img alt="Contributors" src="https://img.shields.io/github/contributors/ValentinHerrmann/Examance?color=f97316&labelColor=1f2937&style=for-the-badge"></a>
  <a href="https://github.com/ValentinHerrmann/Examance/issues"><img alt="Open issues" src="https://img.shields.io/github/issues/ValentinHerrmann/Examance?color=ef4444&labelColor=1f2937&style=for-the-badge"></a>
  <a href="https://github.com/ValentinHerrmann/Examance/pulls?q=is%3Apr+is%3Aclosed"><img alt="Closed PRs" src="https://img.shields.io/github/issues-pr-closed/ValentinHerrmann/Examance?color=8b5cf6&labelColor=1f2937&style=for-the-badge"></a><a href="https://github.com/ValentinHerrmann/Examance"><img alt="Top language" src="https://img.shields.io/github/languages/top/ValentinHerrmann/Examance?labelColor=1f2937&style=for-the-badge"></a>
  <a href="https://github.com/ValentinHerrmann/Examance"><img alt="Languages" src="https://img.shields.io/github/languages/count/ValentinHerrmann/Examance?labelColor=1f2937&style=for-the-badge"></a>
  <a href="https://github.com/ValentinHerrmann/Examance"><img alt="Repo size" src="https://img.shields.io/github/repo-size/ValentinHerrmann/Examance?labelColor=1f2937&style=for-the-badge"></a>
</p>

</div>


## Information & Documentation

**<https://valentin-herrmann.com/examance/>**: Information page

**<https://docs.examance.de/>**: Documentation built from `/docs` of latest Release

- [User guide](https://docs.examance.de/user/) and [info material](https://docs.examance.de/user/material) (slide decks and posters, German)
- [Host Examance](https://docs.examance.de/hosting) on your own server
- [Develop](https://docs.examance.de/data_flow_and_security): architecture, encryption, API, data model
- [Legal and compliance](https://docs.examance.de/legal_audit_dsgvo) (DSGVO): audit, records of processing, DPIA, DPA template, breach response

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


<div align="center">

### Tech Stack

<p align="center">
  <!-- Stack -->
  <a href="#"><img alt="Svelte 5" src="https://img.shields.io/badge/Svelte_5-FF3E00?labelColor=1f2937&logo=svelte&logoColor=white&label=&style=for-the-badge"></a>
  <a href="#"><img alt="SvelteKit" src="https://img.shields.io/badge/SvelteKit-FF3E00?labelColor=1f2937&logo=svelte&logoColor=white&label=&style=for-the-badge"></a>
  <a href="#"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?labelColor=1f2937&logo=typescript&logoColor=white&label=&style=for-the-badge"></a>
  <a href="#"><img alt="Python" src="https://img.shields.io/badge/Python-3776AB?labelColor=1f2937&logo=python&logoColor=white&label=&style=for-the-badge"></a>
  <a href="#"><img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-009688?labelColor=1f2937&logo=fastapi&logoColor=white&label=&style=for-the-badge"></a>
  <a href="#"><img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-4169E1?labelColor=1f2937&logo=postgresql&logoColor=white&label=&style=for-the-badge"></a>
  <a href="#"><img alt="Redis" src="https://img.shields.io/badge/Redis-DC382D?labelColor=1f2937&logo=redis&logoColor=white&label=&style=for-the-badge"></a>
  <a href="#"><img alt="Docker" src="https://img.shields.io/badge/Docker-2496ED?labelColor=1f2937&logo=docker&logoColor=white&label=&style=for-the-badge"></a>
  <a href="#"><img alt="LaTeX" src="https://img.shields.io/badge/LaTeX-008080?labelColor=1f2937&logo=latex&logoColor=white&label=&style=for-the-badge"></a>
  <a href="#"><img alt="Cloudflare Pages" src="https://img.shields.io/badge/Cloudflare_Pages-F38020?labelColor=1f2937&logo=cloudflarepages&logoColor=white&label=&style=for-the-badge"></a>
  <a href="#"><img alt="Vitest" src="https://img.shields.io/badge/Vitest-6E9F18?labelColor=1f2937&logo=vitest&logoColor=white&label=&style=for-the-badge"></a>
  <a href="#"><img alt="Playwright" src="https://img.shields.io/badge/Playwright-2EAD33?labelColor=1f2937&logo=playwright&logoColor=white&label=&style=for-the-badge"></a>
  <a href="#"><img alt="pytest" src="https://img.shields.io/badge/pytest-0A9EDC?labelColor=1f2937&logo=pytest&logoColor=white&label=&style=for-the-badge"></a>
</p>

### Security
<p align="center">
  <!-- Privacy -->
  <a href="https://docs.examance.de/data_flow_and_security"><img alt="Encryption" src="https://img.shields.io/badge/Encryption-AES--256--GCM-22c55e?labelColor=1f2937&logo=letsencrypt&logoColor=white&style=for-the-badge"></a>
  <a href="https://docs.examance.de/data_flow_and_security"><img alt="Zero knowledge" src="https://img.shields.io/badge/Zero_knowledge-client--side-22c55e?labelColor=1f2937&logo=protonmail&logoColor=white&style=for-the-badge"></a>
  <a href="https://docs.examance.de/legal_audit_dsgvo"><img alt="DSGVO" src="https://img.shields.io/badge/DSGVO-documented-3B82F6?labelColor=1f2937&logo=gdpr&logoColor=white&style=for-the-badge"></a>
  <a href="https://github.com/ValentinHerrmann/Examance/security/policy"><img alt="Security policy" src="https://img.shields.io/badge/Security-policy-ef4444?labelColor=1f2937&logo=github&logoColor=white&style=for-the-badge"></a>
  </p>

### SonarQube | CI

  

<p align="center">
<a href="https://github.com/ValentinHerrmann/Examance/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/ValentinHerrmann/Examance/ci.yml?branch=main&label=CI&labelColor=1f2937&logo=githubactions&logoColor=white&style=for-the-badge"></a>
  <a href="https://github.com/ValentinHerrmann/Examance/actions/workflows/docs.yml"><img alt="Docs build" src="https://img.shields.io/github/actions/workflow/status/ValentinHerrmann/Examance/docs.yml?label=Docs&labelColor=1f2937&logo=vitepress&logoColor=white&style=for-the-badge">
  <!-- Quality (SonarCloud) -->
  <a href="https://sonarcloud.io/summary/overall?id=ValentinHerrmann_Examance"><img alt="Quality gate" src="https://img.shields.io/sonar/quality_gate/ValentinHerrmann_Examance?server=https%3A%2F%2Fsonarcloud.io&labelColor=1f2937&style=for-the-badge"></a>
  <a href="https://sonarcloud.io/summary/overall?id=ValentinHerrmann_Examance"><img alt="bugs" src="https://img.shields.io/sonar/bugs/ValentinHerrmann_Examance?server=https%3A%2F%2Fsonarcloud.io&labelColor=1f2937&style=for-the-badge"></a>
  <a href="https://sonarcloud.io/summary/overall?id=ValentinHerrmann_Examance"><img alt="vulnerabilities" src="https://img.shields.io/sonar/vulnerabilities/ValentinHerrmann_Examance?server=https%3A%2F%2Fsonarcloud.io&labelColor=1f2937&style=for-the-badge"></a>
  <a href="https://sonarcloud.io/summary/overall?id=ValentinHerrmann_Examance"><img alt="code_smells" src="https://img.shields.io/sonar/code_smells/ValentinHerrmann_Examance?server=https%3A%2F%2Fsonarcloud.io&labelColor=1f2937&style=for-the-badge"></a>
  <a href="https://sonarcloud.io/summary/overall?id=ValentinHerrmann_Examance"><img alt="sqale_rating" src="https://img.shields.io/sonar/sqale_rating/ValentinHerrmann_Examance?server=https%3A%2F%2Fsonarcloud.io&labelColor=1f2937&style=for-the-badge"></a>
  <a href="https://sonarcloud.io/summary/overall?id=ValentinHerrmann_Examance"><img alt="security_rating" src="https://img.shields.io/sonar/security_rating/ValentinHerrmann_Examance?server=https%3A%2F%2Fsonarcloud.io&labelColor=1f2937&style=for-the-badge"></a>
  <a href="https://sonarcloud.io/summary/overall?id=ValentinHerrmann_Examance"><img alt="reliability_rating" src="https://img.shields.io/sonar/reliability_rating/ValentinHerrmann_Examance?server=https%3A%2F%2Fsonarcloud.io&labelColor=1f2937&style=for-the-badge"></a>
  <a href="https://sonarcloud.io/summary/overall?id=ValentinHerrmann_Examance"><img alt="duplicated_lines_density" src="https://img.shields.io/sonar/duplicated_lines_density/ValentinHerrmann_Examance?server=https%3A%2F%2Fsonarcloud.io&labelColor=1f2937&style=for-the-badge"></a>
</p>


</div>