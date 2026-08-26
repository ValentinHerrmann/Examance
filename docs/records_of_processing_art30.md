# Record of Processing Activities — Art. 30 GDPR

*Verzeichnis von Verarbeitungstätigkeiten*

Two variants follow. Use §A if the school runs Examance itself or teachers use `all-local` mode (school = sole controller). Use §A **and** §B if a third party hosts the backend (school = controller, operator = processor) — this includes `hybrid` mode, since exercises and exam metadata reach that party's server even though student identity and submissions do not; each party keeps its own record.

Fields in *[brackets]* must be completed. Technical fields are pre-filled from the codebase and should be re-checked whenever the architecture changes.

---

## A. Controller's record — Art. 30(1)

| Field | Entry |
| :--- | :--- |
| **1. Controller** | *[School name, address]* |
| Representative | *[Head teacher / Schulleitung]* |
| **2. Data Protection Officer** | *[name, address, email]* |
| **3. Purposes of processing** | Authoring, conducting and grading written examinations; returning grades to pupils; producing class-level performance statistics for teaching review. |
| **4. Legal basis** | Art. 6(1)(e) GDPR — task carried out in the public interest / exercise of official authority — in conjunction with *[Art. 85 BayEUG and BaySchO for Bavaria; state equivalent otherwise]*. **Not** consent. |
| **5. Categories of data subjects** | Pupils (predominantly minors); teaching staff using the application. |
| **6. Categories of personal data** | Pupils: name, pupil number, submitted examination paper (scan), grading annotations, per-exercise and total scores. Teachers: email address, role, authored exam metadata, login/export/deletion events, SHA-256 hash of request IP. Teacher-uploaded exercise resource files (images, PDFs, arbitrary attachments referenced from the LaTeX source) are authored content, but can incidentally contain personal data if a teacher attaches e.g. a photograph of pupils — the upload interface warns against this. |
| **7. Special categories (Art. 9)** | None processed by design. *[Confirm no health or disability data is entered in free-text fields such as `info_text`.]* |
| **8. Recipients** | Internal: the teaching staff assigned to the exam; school administration where grades are transferred. External: see §B sub-processors, if a hosted deployment is used. The web interface itself contacts **no** host other than the configured backend — no CDN, font, analytics or error-reporting service — and the Content-Security-Policy in `frontend/static/_headers` blocks any such request. Two CDN loads (a pdf.js worker, and status images from `http.cat`) existed before this was enforced; see finding L16 in `legal_audit_dsgvo.md` if assessing a past deployment. |
| **9. Third-country transfers** | *[None if self-hosted in the EU/EEA. If the web interface is served by Cloudflare Pages: transfer to the USA — record the transfer basis (EU–US Data Privacy Framework and/or SCCs) and the transfer impact assessment.]* |
| **10. Erasure deadlines** | Each exam carries a `retention_until` date. On expiry, identities and submissions are marked for deletion and irreversibly erased after a grace period (`RETENTION_GRACE_DAYS`, default 7 days). Audit entries are deleted after `AUDIT_LOG_RETENTION_DAYS` (default 365). Exercises and the resource files attached to them are authored content and are **not** covered by the retention sweep; they are erased when the teacher deletes the exercise (the files cascade with it). Statutory retention for graded work under *[state school regulation]* takes precedence and is managed as a records-management control, not by this field. |
| **11. Technical and organisational measures (Art. 32)** | Summary below; full description in `data_flow_and_security.md` and `DPA_template.md` §2. |

### TOM summary (Art. 30(1)(g) → Art. 32)

- **Encryption:** pupil identity data, submission scans and grading annotations are encrypted in the browser (AES-256-GCM). The key is random rather than derived, and a wrapped copy is stored per recovery factor — password, printable recovery code, and PRF-capable passkey — each wrapped under an Argon2id- or HKDF-derived key computed in the browser. The key itself is never transmitted, so a password reset re-wraps it instead of orphaning the data. Server-side plaintext is limited to per-submission scores and exam metadata.
- **Authentication:** every sign-in presents two of three factors (password, passkey, authenticator app). Failed attempts are counted per account with a capped, self-expiring cooloff. A password reset requires a second factor as well: an emailed link alone does not take over an account.
- **Erasure:** deleting a teacher cascades their key wraps away, which leaves any server-side ciphertext of theirs permanently unreadable. That is a supporting technical measure for Art. 17, not a side effect.
- **Pseudonymisation:** submissions are keyed by HMAC-SHA-256 of a pupil identifier; the raw identifier does not reach the server.
- **Access control:** cookie-based sessions (HttpOnly, Secure), short-lived access tokens with rotating refresh tokens and reuse detection, role separation (teacher/admin), and ownership checks on every object-level endpoint.
- **Resilience and abuse resistance:** rate limiting on authentication endpoints, request body size limits, strict CORS allowlist, Origin checks on state-changing requests, sandboxed LaTeX compilation.
- **Confidentiality of statistics:** class statistics are suppressed below k = 5.
- **Accountability:** append-only audit trail of logins, exports and deletions, with IP addresses stored only as hashes.
- **Availability:** *[describe backup and restore arrangements — the application does not provide them]*.

---

## B. Processor's record — Art. 30(2)

Complete only for a hosted deployment.

| Field | Entry |
| :--- | :--- |
| **1. Processor** | *[Operator name, address]* |
| Representative / DPO | *[name, contact]* |
| **2. Controllers on whose behalf processing occurs** | *[List of schools, or reference to the contract register]* |
| **3. Categories of processing** | Storage of client-encrypted pupil identity data, submission scans and annotations; storage of per-submission scores and exam metadata in plaintext; server-side LaTeX compilation; account and session management; audit logging. |
| **4. Third-country transfers** | *[As above.]* |
| **5. Technical and organisational measures** | As in §A, plus infrastructure measures: *[hosting location, physical security, patching, backup encryption, personnel confidentiality undertakings]*. |
| **6. Sub-processors** | *[Name each: web interface hosting, database hosting, cache hosting. Categories are not sufficient under Art. 28(2).]* |

---

## Review

| Version | Date | Author | Change |
| :--- | :--- | :--- | :--- |
| 1.0 | *[date]* | *[name]* | Initial record |

Review at least annually and whenever the processing changes materially.
