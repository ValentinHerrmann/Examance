# Examance — Concept Pitch

*Privacy-first, zero-knowledge-encrypted anonymous exam management and grading.*

> This replaces the earlier `BlindGrade_Presentation.pdf` / `BlindGrade_Poster.png` deck (AI-generated mockup slides, pre-rename). All screenshots below are taken from the current app (v`0.1.0`-line, `main`), running in the default **All Local** storage mode. Repo name `BlindGrade` is legacy — see `CLAUDE.md`; the product is **Examance**.

---

## 1. The problem in the teachers' lounge

| | |
|---|---|
| **The workflow** | Manual correction, transcribing points into spreadsheets, and computing statistics eat into teachers' limited time. |
| **The bias (halo effect)** | A name on the cover sheet unconsciously influences grading before a single answer is read. Genuine objectivity is hard to achieve by willpower alone. |
| **Data protection** | Mainstream cloud edtech tools are frequently a poor — sometimes outright illegal — fit for sensitive pupil data and grades under GDPR/BDSG and Bavarian school law (see `legal_audit_dsgvo.md`). |

Examance addresses all three at once: it automates the mechanical parts of grading, structurally removes the student's identity from the corrector's view during scoring, and is built so that, in its default mode, sensitive data never leaves the teacher's browser at all.

---

## 2. Getting started — no account required

Two entry points, chosen up front and changeable later in Settings: a fully local, offline-first workspace with **zero server dependency**, or a school-managed cloud account for cross-device sync. Either way, all sensitive data is encrypted client-side before it is ever written to disk (Argon2id → HKDF-SHA-256 → AES-256-GCM; details in `data_flow_and_security.md`).

![Welcome screen — Start Local Workspace vs. Connect to Cloud Server](screenshots/pitch/01-welcome.png)

Once unlocked, the dashboard is the home base for every exam in the workspace:

![Exams dashboard — onboarding empty state](screenshots/pitch/02-dashboard.png)

---

## 3. Pillar 1 — Reusable exercise library & LaTeX exam authoring

Exercises live in a **shared, taggable library** (topic, grade, subject) rather than being copy-pasted between exam files each term. Each exercise is authored as a LaTeX fragment with live PDF preview and automatic point-value parsing, and supports free-text, single-choice, and multiple-choice question types.

![Exercise editor — LaTeX source with live grade/subject/topic tagging](screenshots/pitch/03-exercise-editor.png)

The library groups exercises, tracks **variants** (e.g., a "vehicle" vs. "furniture" phrasing of the same logic problem, for anti-copying A/B/C groups) and **versions** (fix history with diffing), all filterable by grade, subject, and topic:

![Exercise library — grouped, tagged, filterable](screenshots/pitch/04-exercise-library.png)

Building an exam is then an assembly step: pick exercises from the library (or add one-off custom items), configure the grading key (linear, *Oberstufe*-weighted, or custom cutoffs per grade 1–6), and Examance renders the LaTeX into a print-ready, QR-coded booklet — one unique code per exam/variant/student slot, generated locally via a WASM XeLaTeX engine (Tectonic) with no source ever leaving the browser in local mode.

![Exam creation — metadata, grading key, exercise assembly](screenshots/pitch/05-exam-creation.png)

---

## 4. Pillar 2 — Digital, anonymous correction

The paper workflow stays familiar for students — write, submit — and only turns digital at the teacher's desk:

1. **Write** — students complete the printed, QR-coded exam with pen and paper as usual.
2. **Scan** — the stack goes through the school scanner into a single PDF.
3. **Split & encrypt** — Examance splits the PDF by QR code and encrypts every page client-side; the plaintext scan never has to touch a server if local mode is used.
4. **Grade** — the teacher corrects on-screen with pen/mouse annotations over the scan (destructive-free HTML5 canvas overlay; originals stay untouched).

Two grading paths, matched to question type:

- **Free-text / manual**: the teacher sees the handwriting and the answer — **not** the student's name — during scoring. Identity and answer are decoupled for the whole grading pass, only re-linked afterward for the class list.
- **Multiple-choice / single-choice**: a WebAssembly optical-mark-recognition (OMR) pass detects marked boxes automatically and applies configured penalty logic, no manual tallying required.

---

## 5. Pillar 3 — Didactic analytics, without compromising privacy

Once submissions are graded, Examance aggregates results into class- and cross-exam analytics — score distributions, per-topic heatmaps highlighting knowledge gaps, exercise/question quality metrics (which questions consistently underperform across years), and variant-fairness comparisons (did group A's variant turn out harder than group B's?). CSV/XLSX export supports handing results to the school's grade-management system.

![Global multi-exam analytics — cross-exam metrics and fairness comparisons](screenshots/pitch/07-analytics.png)

All of this runs on data that, in the default storage mode, was never uploaded anywhere — analytics are computed from the encrypted local vault the same way grading was.

---

## 6. No compromises on data protection

Configurable independently in **Settings**, per school's policy and per component (storage vs. LaTeX compilation):

![Settings — storage strategy and LaTeX compilation mode](screenshots/pitch/06-privacy-settings.png)

- **All Local** *(default)* — exams, exercise library, student identities, and scans are encrypted and stored entirely in the browser (IndexedDB). Zero bytes reach a server. The whole workspace can be exported/imported as a single password-protected `.bgproj` archive (e.g., on a USB stick) for backup or transfer between machines.
- **All Server** — everything synced through the backend as **AES-256-GCM ciphertext**; the server generates and stores encrypted blobs but the key never leaves the client, so it can never read plaintext exam or student data.
- **Hybrid** — exercise library and exam templates live on the server (useful for a department sharing a catalog across teachers), while student identities and grading results stay 100% local.

LaTeX compilation is a separate toggle: local WebAssembly (Tectonic, nothing leaves the browser) or server-side compilation for lower-spec hardware. The local WASM engine additionally routes around hardware limits automatically — sequential "assembly line" rendering on low-spec/eco devices to bound memory use, multi-core/SIMD parallel rendering via Web Workers on capable machines — so a large multi-page exam PDF compiles reliably even on aging school laptops.

---

## 7. Conclusion — value at every level

| For teachers | For students | For school leadership |
|---|---|---|
| Real time savings: automatic MC/SC scoring, a reusable exercise library, and the end of manual grade tallying. | Guaranteed fairness — objective, anonymous grading through strict identity/answer decoupling during correction. | Legal certainty: a privacy-by-design system with no compromise on GDPR/Bavarian school-law data protection (see `legal_audit_dsgvo.md` for the current audit state and open items). |

---

**Product:** Examance — Privacy-First Anonymous Exam Management. Repo: `BlindGrade` (legacy name). See `README.md` for the documentation index, `deployment.md` for the production/preview topology, and `data_flow_and_security.md` for the full encryption architecture.
