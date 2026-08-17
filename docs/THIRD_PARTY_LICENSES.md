# Third-Party Dependencies and Subresource Integrity (SRI) Manifest

This document details the third-party software components and licenses used in Examance, and the current state of the Subresource Integrity (SRI) control over the WASM modules among them.

> **SRI is not currently enforced.** See §1 below and `legal_audit_dsgvo.md` §5 for the authoritative statement of what this means and why — this document does not restate the reasoning, only the fact.

---

## 1. WebAssembly (WASM) Modules & Vendored Assets

| Package | Version | License | Integrity Hash (SHA-256) |
|---|---|---|---|
| **argon2-browser** | 1.18.0 | MIT | `sha256-PLACEHOLDER_FILL_AFTER_VENDORING` |
| **zxing-wasm** | 1.2.3 | MIT | `sha256-PLACEHOLDER_FILL_AFTER_VENDORING` |
| **texlyre-busytex** (Tectonic/XeLaTeX via WASM, local-compile path) | 1.2.3 | MIT | not tracked in `sri-manifest.json` |

*Integrity verification is scaffolded but not wired in.* `fetchAndVerifyWasm()` exists in `$lib/crypto/sri.ts` but is not called from any loader; `static/sri-manifest.json` declares `"enforced": false` with every hash still a placeholder. The Argon2 module that derives every encryption key is therefore loaded unverified today. `opencv.js`, previously listed here, is not a dependency of the current codebase (zero references under `frontend/src`) and has been removed from this table.

---

## 2. Frontend JavaScript Libraries

Runtime (shipped) dependencies from `frontend/package.json`:

| Library | Version | License | Purpose |
|---|---|---|---|
| **SvelteKit** | 2.5.0 | MIT | Static application framework (Svelte 4, not 5 — see `CLAUDE.md`) |
| **Dexie.js** | 4.0.0 | Apache 2.0 | Typed IndexedDB wrapper, primary encrypted local store |
| **fflate** | 0.8.2 | MIT | High-performance DEFLATE compression in workers |
| **qrcode** | 1.5.3 | MIT | QR code data URL generator |
| **pdfjs-dist** | 6.1.200 | Apache 2.0 | PDF rendering and annotation extraction; worker bundled from own origin (`$lib/pdf/pdfjs.ts`) per the CSP, not loaded from a CDN |
| **pdf-lib** | 1.17.1 | MIT | Client-side PDF generation/manipulation |
| **layerchart** | 1.0.13 | MIT | Charting (class statistics, grade distribution) |
| **Tailwind CSS** | 4.3.3 | MIT | Utility CSS, build-time only |

---

## 3. Backend Python Packages

| Package | Version | License | Purpose |
|---|---|---|---|
| **FastAPI** | 0.111.0 | MIT | Web API framework |
| **SQLAlchemy** | 2.0.0 | MIT | Async ORM & database interface |
| **argon2-cffi** | 23.1.0 | MIT | Argon2id password hashing |
| **PyJWT** | 2.8.0 | MIT | Secure JWT encoding & decoding |
| **Tectonic** | Latest | MIT | Standalone LaTeX compiler invoked with `--untrusted` |

---

## 4. Related documents

- `legal_audit_dsgvo.md` §5 — authoritative statement on the unenforced-SRI risk and the open dependency advisory (Vite, GHSA-4w7w-66w2-5vf9)
- `dpia_art35.md` R8 — SRI risk rated in the DPIA risk table
