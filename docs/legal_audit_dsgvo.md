# Legal Audit — DSGVO / BDSG / Bavarian School Law

**Subject:** Examance (repository: BlindGrade), a privacy-first exam authoring and grading application.
**Assumed deployment:** hosted, used and maintained in Germany, primarily for Bavarian schools.
**Method:** manual review of the source tree against the Regulation, read alongside a static security review of the same codebase. Every finding cites the code it is drawn from.
**Status of this document:** the code findings below were remediated in the same change set that introduced this file; each carries its post-fix state. The organisational findings (Art. 30, Art. 35, legal basis, operator identity) remain open and are the school's to complete.

> **This is not legal advice.** It is an engineering assessment of where the software helps or hinders compliance. The controller's DPO must review it, and the state-law parameters in §2 must be confirmed before production use.

---

## 1. Role model — who owes which duty

Examance supports two deployment shapes, and the duties differ. Every finding below is tagged **[C]** (controller), **[P]** (processor) or **[C+P]**.

| Deployment | Controller | Processor | Notes |
| :--- | :--- | :--- | :--- |
| **A — School self-hosts.** The school runs the backend, or teachers use `all-local` mode with no backend at all. | The school | none | No Art. 28 contract needed. The school owes Art. 30 records, the Art. 35 DPIA, and the Art. 13 notice directly. |
| **B — A third party hosts for schools.** | Each school | The operator | Art. 28 contract required before any processing — see `DPA_template.md`. The operator owes Art. 32 measures, Art. 33(2) notification to the school, and sub-processor transparency. |

In **both** shapes the school is the controller: it decides that exams are graded and why. The teacher is not a separate controller; they act for the school. In `all-local` mode the data never leaves the teacher's browser, which changes the technical exposure but **not** the school's controllership — see L12. `hybrid` mode sits between the two: student identity and submissions stay local like `all-local`, but exercises and exam metadata go to a backend like shape B.

---

## 2. Jurisdiction and state-law parameters

DSGVO applies directly. BDSG supplements it. For a public school, the decisive additional layer is **state** law, which fixes the legal basis, the retention periods and the competent authority.

| Parameter | Bavaria (primary deployment) | Another Land — fill in |
| :--- | :--- | :--- |
| Legal basis for processing | Art. 6(1)(e) DSGVO in conjunction with **Art. 85 BayEUG** and **BaySchO** | *[state education act + school regulation]* |
| Supplementary state data-protection law | **BayDSG** | *[state DSG]* |
| Competent supervisory authority | **Bayerischer Landesbeauftragter für den Datenschutz (BayLfD)** — public bodies, including state schools. **Not** BayLDA, which supervises the private sector. | *[authority competent for public bodies]* |
| Statutory retention for written exam work | Set by BaySchO — **confirm the current period with the school's DPO**; this audit does not fix a number | *[period]* |
| Processing on private devices | Bavarian rules restrict processing student data on privately owned devices — relevant to `all-local` mode, and to `hybrid` mode for the student data it keeps local, see L12 | *[state rules]* |

**Why Bavaria is assumed:** the codebase is built around Bavarian exam terminology — `testart` defaults to *Kurzarbeit*, the LaTeX package is `Schulaufgabe.sty`, and scoring uses *BE* (Bewertungseinheiten). If the deployment is in another Land, change the table above; nothing else in this document depends on it.

---

## 3. Data inventory

Derived from the backend models and `data_flow_and_security.md` §3. "Pseudonymous" means personal data under Art. 4(5) — the controller holds the means to re-identify.

| Data | Category | Where | Encrypted at rest? |
| :--- | :--- | :--- | :--- |
| Student name, student number | Personal, of a minor | Browser IndexedDB; server only in `all-server` mode | Yes — AES-256-GCM, key never leaves the browser |
| Submission scan (exam paper) | Personal, of a minor | as above | Yes |
| Grading annotations | Personal, of a minor | as above | Yes |
| `total_score` per submission | **Pseudonymous, plaintext** | Server (`scan_submissions`) | **No** |
| `pseudonym_hmac` | Pseudonymous identifier | Server | n/a (is itself an HMAC) |
| Exam metadata (title, class, subject, date, teacher surname) | Personal (identifies a teacher and a class) | Server | **No** |
| Teacher email, role, password hash | Personal | Server (`teachers`) | Hash only (Argon2id) |
| Audit entries: teacher email, action, SHA-256 of target, SHA-256 of IP | Personal | Server (`audit_logs`) | **No** (IP is hashed) |

Two consequences worth stating plainly: the "zero-knowledge" property is real for student identity, scans and annotations, and **not** claimed for scores or metadata; and pseudonymous is not anonymous, so the full Regulation applies to submissions.

---

## 4. Findings

### L1 — Expired exams never erased their student data · Art. 5(1)(e), 17(1)(a) · [C+P] · **Fixed**

`services/retention.py` soft-deleted the `Exam` row and nothing else. `StudentIdentity.retention_until` and `ScanSubmission.retention_until` were only ever set by the manual purge endpoint (`routers/user.py`), and no code path hard-deletes an `Exam` — so the identities, scans and annotations of every expired exam stayed in the database indefinitely, with no route to deletion at all.

This was the most serious compliance defect found: the application's central storage-limitation promise did not execute.

**Fixed:** exam expiry now stamps a grace deadline onto the exam's student identities and submissions, and the same job hard-deletes them once it passes. Covered by `tests/test_retention.py`, which fails against the previous implementation.

### L2 — Erasing one student deleted every student's submissions · Art. 5(1)(d), 17 · [C+P] · **Fixed**

`lib/gdpr/erasure.ts` selected the submissions to delete with `allSubs.filter((s) => s.pseudonymHash)` — a truthiness test, not an identity comparison. Every submission in the exam carries a `pseudonymHash`, so an Art. 17 request from one pupil destroyed the graded work of the entire class.

An erasure routine that over-deletes is both a data-loss bug and an integrity failure under Art. 5(1)(d); it would also destroy records the school is required by state law to retain.

**Fixed:** the filter now compares against the target `pseudonymId`.

### L3 — Compliance documents asserted controls the code lacked · Art. 28(3)(c)+(h), 32, 5(2) · [P] · **Fixed**

`DPA_template.md` is an Art. 28 contract template a school would sign. It asserted three technical measures that did not exist:

| Asserted | Actual |
| :--- | :--- |
| `SameSite=Strict` cookies | `SameSite=None` (`routers/auth.py`) |
| `tectonic --untrusted` | flag absent from the command (`services/latex.py`) |
| Keys "never written to LocalStorage, SessionStorage, or IndexedDB" (`data_flow_and_security.md`) | written to both `sessionStorage` and `localStorage` (`stores/session.ts`) |

These are representations to the controller, not stale comments. Signing on them would misstate the Art. 32 measures.

**Fixed** on both sides: `--untrusted` was added to the code; the cookie and key-storage claims were rewritten to describe what the system actually does, including the trade-offs. See §5 for the remaining honest caveats.

### L4 — Sub-processors not named; no Chapter V assessment · Art. 28(2)+(3)(a), 44–49, 13(1)(f) · [C+P] · **Partly fixed**

The sub-processor list named "PostgreSQL 16 Hosting Provider" and "Redis 7 Hosting Provider" — categories, not parties, which does not satisfy Art. 28(2). It omitted **Cloudflare Pages** entirely, although the web interface is deployed there (a US-headquartered provider), so no third-country transfer assessment existed for the component that actually serves the application to users.

**Fixed in the template:** Cloudflare is now named with a transfer-basis column, and the remaining hosting providers have placeholder rows. **Open for the operator:** name the actual providers and record the transfer impact assessment. If the school self-hosts the frontend inside the EU/EEA, delete that row instead.

### L5 — No Impressum and no Datenschutzerklärung · § 5 DDG, Art. 12–14 · [C] · **Fixed (scaffolding)**

Neither existed anywhere in the application. § 5 DDG requires a reachable Impressum; Art. 13 requires the information notice to be given at collection.

**Fixed:** `/legal/impressum` and `/legal/datenschutz` were added, linked from a footer on every page, and exempted from the unlock redirect so they are reachable without logging in. **Open:** both ship with clearly marked placeholders — operator identity, DPO contact, the state-law legal basis, and the hosting details are facts only the operator can supply. They must be completed and legally reviewed before production.

### L6 — No Art. 30 record and no Art. 35 DPIA · Art. 30, 35 · [C] · **Open (templates provided)**

Neither document existed. A DPIA is not optional here: the processing concerns **children's data** (Recital 38, vulnerable data subjects) and involves **systematic evaluation** of pupils, two criteria on the DSK's list of processing operations requiring a DPIA. The screening in `dpia_art35.md` concludes that a DPIA **is** required rather than leaving the question open.

Templates: `records_of_processing_art30.md`, `dpia_art35.md`. Both need the controller's input to complete.

### L7 — Audit entries retained forever · Art. 5(1)(e); 17(3) · [C+P] · **Fixed**

`models/audit_log.py` declared rows "NEVER soft-deleted", and nothing ever deleted them. They hold `teacher_email` and a hashed IP. Art. 17(3)(b) justifies keeping an audit trail for a defined period; it does not justify keeping it forever.

**Fixed:** entries older than `AUDIT_LOG_RETENTION_DAYS` (default 365) are deleted by the retention job.

### L8 — Teachers had no access or erasure route · Art. 15, 17 · [C+P] · **Fixed**

`routers/user.py` could purge *student* data but offered the account holder nothing. Teachers are data subjects too: the system holds their email, role, authored exams and audit trail.

**Fixed:** `GET /api/v1/user/me/export` (Art. 15/20) and `DELETE /api/v1/user/me` (Art. 17). Deletion soft-deletes the teacher's exams and student data on the standard grace period and removes the account; audit rows are retained with `teacher_id` nulled under Art. 17(3)(b) and age out under L7's period. That retention decision is documented in the endpoint rather than left implicit.

### L9 — No subject access export for a student · Art. 15(3), 20 · [C] · **Fixed**

The only export was `.bgproj` — a whole-workspace backup encrypted with the teacher's key. Useful for recovery, useless as the "copy of the personal data undergoing processing" a pupil or parent is entitled to. Answering an access request meant assembling it by hand.

**Fixed:** `lib/gdpr/subjectAccess.ts` produces a decrypted, readable JSON export for one student, surfaced in Settings beside the existing erasure button, and logged as a disclosure in the audit trail.

### L10 — Retention window unbounded · Art. 5(1)(e) · [C+P] · **Fixed**

`retention_until` accepted any date, including the year 2999, and the erasure grace period was hardcoded.

**Fixed:** an upper bound (`RETENTION_MAX_DAYS`, default 10 years) is enforced on create and update; the grace period is configurable.

*A note on the lower bound:* a floor was initially added on the theory that state law requires exam work to be kept. That was wrong and was removed. The statutory duty binds the **school's records management** over official graded work; forcing it onto every `Exam` row would prevent a teacher from deleting a draft or a practice exam, working directly against Art. 5(1)(e). `RETENTION_MIN_DAYS` therefore defaults to 0 and exists only for schools that choose to enforce a floor in software.

### L11 — Legal basis never stated · Art. 6(1)(e), 13(1)(c) · [C] · **Open**

No document stated why the processing is lawful. For a Bavarian public school it is Art. 6(1)(e) plus Art. 85 BayEUG / BaySchO — **not consent**. This matters practically: consent must be freely given and revocable, and pupils cannot freely refuse to have their exams graded. Asking for consent here would be both unnecessary and misleading.

The Datenschutzerklärung template states this with a placeholder for the state-law citation. The controller must confirm it.

### L12 — `all-local` (and `hybrid`) put student data on the teacher's device · Art. 32; state rules on private devices · [C] · **Improved, residual risk stands**

`all-local` is the default mode: student identities, scans and annotations live in the teacher's browser profile. `hybrid` mode keeps the same student-data exposure — only exercises and exam metadata move to a backend there. Until this change set, the anonymous variant generated a random password and stored it **in cleartext in `localStorage`, beside the IndexedDB it protected** — so encryption at rest gave no protection whatsoever against anyone with access to the browser profile.

**Fixed:** the vault is now keyed by a passphrase the user supplies, which is never persisted; only the salt and nonce are stored. Existing vaults are re-encrypted on next unlock.

**Residual risk, stated deliberately:** while a tab is unlocked, the derived session key sits in `sessionStorage` so the workspace survives a page reload. Anyone who can run script on the origin, or who reaches an already-unlocked tab, can read the data. `all-local` (and `hybrid`, for its local portion) protects a *stored* device, not an *unattended* one.

**Open for the controller:** Bavarian rules restrict processing student data on privately owned devices. If teachers use personal laptops, the school must authorise it and set conditions (full-disk encryption, screen lock, no shared profiles). This is an organisational control the software cannot supply.

### L13 — Breach checklist named no DPO or authority · Art. 33, 34 · [C+P] · **Fixed**

The checklist gave no DPO, no supervisory authority, no owner of the 72-hour clock, and omitted the Art. 33(2) processor→controller step entirely. Its risk assessment also asserted that encrypted dumps are safe without qualification — an Art. 34(3)(a) argument that fails if a passphrase was weak, if a client device was involved, or if the vault predates the PBKDF2 increase.

**Fixed:** contacts table with BayLfD named (and BayLDA explicitly excluded as non-competent), an explicit Art. 33(2) step, and a conditional Art. 34(3)(a) test rather than a blanket claim.

### L14 — "Anonymized analytics" overstated · Recital 26, Art. 4(5), 28(3) · [C+P] · **Fixed**

The DPA described the analytics as anonymised while per-submission scores are stored server-side in plaintext against a pseudonym. **Fixed:** the template now distinguishes pseudonymous submission data (personal data, full Regulation applies) from the aggregated k ≥ 5 statistics.

### L15 — Scope note: the access-control defects did not expose student data · [C+P] · **Recorded**

The security review found that any authenticated teacher could read, modify or delete any other teacher's **exercises**, and link a foreign exercise into their own exam to read it back. This is a serious confidentiality failure — it exposes unreleased exam questions and answer keys — but it is **not** a personal-data breach: the affected records contain teacher-authored content only.

The endpoints holding student data (`routers/submissions.py`, `routers/students.py`) were correctly scoped by exam ownership throughout, and remain so.

This distinction is recorded deliberately so that, if the defect is ever assessed retrospectively, it is not over-reported as an Art. 33 notifiable breach on the strength of the security finding's severity alone. It was still a genuine Art. 32 failure and has been fixed.

### L16 — Third-party asset loads disclosed every user to CDNs · Art. 13(1)(e), 30(1)(d), 44 ff. · [C+P] · **Fixed**

**The original security review missed this entire class of defect.** It audited what the application sends to its own backend and did not check what the browser fetches from other origins. Two live third-party loads were found afterwards:

- **pdf.js worker** — `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/<version>/pdf.worker.min.mjs`, on five call sites in the exam, scan and grading views. It executed on every PDF open, i.e. in the core grading workflow.
- **`http.cat` status images** — `HttpCatModal` is mounted globally in `routes/+layout.svelte` and requested `https://http.cat/<status>` on **every** API error.

Neither is a disclosure of exam content: only request metadata leaves the browser. But that metadata — IP address, User-Agent, `Referer`, timing, and in the `http.cat` case the failing status code — is personal data, sent to operators in a third country, on the ordinary path of a teacher's work. That makes them recipients under Art. 13(1)(e) and Art. 30(1)(d), and a Chapter V transfer. None was named in any document; `docs/` stated the opposite.

**Fixed:** the pdf.js worker is bundled and served from our own origin (`src/lib/pdf/pdfjs.ts`). The `http.cat` image is removed — the modal now renders the status code and text locally. Redistributing the artwork was not an option, as it is not licensed for reuse.

Two controls now hold the line, which is the point of the finding: the CSP is `default-src 'self'` with no CDN allowances, so a reintroduced load is *blocked* rather than silently working; and `frontend/tests/cspHeaders.test.ts` fails the build if any file under `frontend/src/` names an off-origin host outside a small allowlist (XML namespaces, `localhost`, and a form placeholder).

**Note for a reader assessing the past:** these loads were live in every deployed version before this branch. If a retrospective assessment is needed, the exposure is request metadata only, continuous, to Cloudflare Inc. (pdf.js) and the `http.cat` operator.

### L17 — Student name and fallback code stored in plaintext in IndexedDB · Art. 5(1)(f), 32 · [C+P] · **Fixed**

`encryptStudent()` (`lib/db/dbEncryption.ts`) writes `fallbackCode`, `studentName` and `studentNumber` into the returned `StudentRecord` **in addition to** the encrypted `payloadCt`/`payloadIv` it produces from the same fields, and `studentRepository.ts` persists that record as-is via `db.students.put()`. `fallbackCode` is also a plaintext Dexie index (`db.ts`: `students: 'pseudonymId, examId, fallbackCode'`).

This contradicts `data_flow_and_security.md` Core Invariant 1 ("zero unencrypted text" when locked) for exactly the fields — a pupil's name and ID number — that invariant exists to protect, in both `all-local` and `hybrid` mode.

**Found during a documentation review** (2026-08-17) while verifying the storage table in §3 against the live schema.

**Fixed.** `encryptStudent()` no longer re-emits the three fields: what it returns carries the pupil's identity only inside `payloadCt`, and callers read it back through `decryptStudent()`. Called without a key it now refuses to write identity data at all, rather than falling through to plaintext columns. `studentRepository.save()` performs the local `db.students.put()` only outside `all-server` mode — the write used to happen before the mode check, so pupil names persisted locally even in the mode whose whole point is that nothing does. Dexie **v9** drops the `fallbackCode` index (nothing queried it, and an index is itself a plaintext copy) and strips the three columns from every stored row; the strip needs no key, so it also runs on a locked vault.

Two things a reader should not over-read. The upgrade rewrites rows on this device when the browser next opens the database — a device that never opens it again keeps its old rows. And server-side `student_identities` rows were never affected: they only ever held ciphertext.

---

## 5. Honest caveats

Things a reader should not conclude from this document:

- **"Zero-knowledge" is not absolute.** It holds for student identity, scans and annotations. Scores and exam metadata are plaintext on the server. The phrase is used in the marketing sense, and the DPA now says which fields it covers.
- **Encryption at rest depends on the passphrase.** A weak teacher passphrase is offline-guessable against a stolen dump. Nothing in the software enforces passphrase strength for the local vault beyond a 12-character minimum.
- **Vaults written before the PBKDF2 increase** are still openable via a decrypt-only legacy path at 1,000 iterations, until re-encrypted. Data protected only by that key is materially weaker.
- **Subresource integrity is not enforced.** `sri-manifest.json` declares `"enforced": false`; no WASM binary is vendored or hash-verified. The build step reports the absence of the control rather than pretending to pass. The Argon2 module that derives every key is therefore loaded unverified.
- **One dependency advisory is open and cannot currently be closed.** Vite carries a path-traversal advisory in its dev server (GHSA-4w7w-66w2-5vf9), fixed only in versions above 6.4.1. That upgrade is unreachable while the project is on Svelte 4: `@sveltejs/vite-plugin-svelte` 3.x is the last line supporting Svelte 4 and pins `vite ^5`, and every later version requires Svelte 5. Vite 8 was attempted and reverted — the build fails because `vite-plugin-top-level-await` resolves esbuild out of Vite's distribution, which Vite 8 replaced with rolldown. The affected code is the development server, which does not run in production: the frontend ships as static files. The CI `npm audit` step is deliberately left **failing** rather than narrowed, so the open advisory stays visible. Closing it means migrating Svelte 4 → 5.
- **This review missed the third-party asset loads on its first pass** (L16). The methodology audited requests to our own backend and did not enumerate what the browser fetches from other origins; two CDN loads were live in every deployed version until they were found afterwards. Treat the "no external hosts" property as resting on the CSP and the test that now enforce it, not on the thoroughness of this document.
- **The full LaTeX compile path was not executed end-to-end** during this work: the sandbox could not reach Tectonic's TeX Live bundle. `--untrusted` was confirmed to be a real, documented flag on the pinned version and its placement is unit-tested, but a live compile should be run before deployment.

---

## 6. What remains open

Ordered by what blocks a school deployment.

1. **Complete the Impressum and Datenschutzerklärung placeholders** (L5, L11) — operator identity, DPO, legal basis. Blocking: shipping without these is unlawful on day one.
2. **Confirm the state-law parameters in §2** with the school's DPO, especially the statutory retention period. Blocking.
3. **Conduct the DPIA** (L6) using `dpia_art35.md`. Blocking: it is required, and it must precede processing.
4. **Complete the Art. 30 record** (L6) using `records_of_processing_art30.md`.
5. **Name the sub-processors and record the transfer assessment** (L4). Blocking in deployment shape B.
6. **Decide the private-device question** (L12) if teachers use personal machines.
7. **Set a real `SECRET_KEY`** and confirm the app refuses to start without one — it now does.
8. **Consider enforcing SRI** (§5) by vendoring and hashing the WASM binaries.

---

## 7. Related documents

- `data_flow_and_security.md` — architecture and key handling, corrected alongside this audit
- `DPA_template.md` — Art. 28 contract, corrected alongside this audit
- `breach_response_checklist.md` — Art. 33/34 procedure, extended alongside this audit
- `records_of_processing_art30.md` — Art. 30 template
- `dpia_art35.md` — DPIA screening and template
