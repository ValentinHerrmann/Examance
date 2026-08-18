# Data Processing Agreement (DPA) Template — Examance

This Data Processing Agreement ("DPA") supplements the main terms of service between the **Data Controller** (Educational Institution / School / University) and the **Data Processor** (Examance Hybrid Service Provider) pursuant to Article 28 of the General Data Protection Regulation (GDPR).

---

## 1. Scope and Object of Processing

1.1 **Subject Matter:** Processing of student examination scans, pseudonymized identity records, and grading scores for examination evaluation and grade administration.
1.2 **Duration:** For the duration of the educational institution's active subscription, plus applicable statutory document retention periods.
1.3 **Nature & Purpose:**
- Local zero-knowledge encryption of student personal data (PII).
- Server-side storage of encrypted blobs (AES-256-GCM).
- Group statistical analytics over per-submission scores, subject to a k ≥ 5 threshold.

1.4 **Note on "anonymous":** submissions are **pseudonymous**, not anonymous.
Each is keyed by an HMAC of a student identifier, and the total score is stored
server-side in plaintext against that pseudonym. Because the Controller holds
the means to re-identify, this remains personal data under Art. 4(5) and
Recital 26 GDPR, and the full obligations of the Regulation apply to it. Only
the aggregated k ≥ 5 statistics are treated as anonymous.

---

## 2. Technical and Organizational Measures (TOMs)

Pursuant to GDPR Article 32, the Processor implements the following security guarantees:

1. **Zero-Knowledge Architecture:** Student names and identity numbers are encrypted client-side in the browser using AES-256-GCM before transmission. The server never receives raw student identity data.
2. **Deterministic Pseudonym Hashing:** Student submission records use HMAC-SHA-256 keyed with a client-derived exam secret (`pseudonym_hmac`).
3. **Strict Authentication:** Authentication tokens are issued exclusively via `httpOnly`, `Secure`, `SameSite=None` cookies, never in a response body, and are not readable by JavaScript. `SameSite=None` is required because the web interface and the API are served from different registrable domains. The resulting cross-site exposure is compensated by an explicit CORS origin allowlist (no wildcard; an empty list is a startup error), an `Origin` check on every state-changing request, and refresh-token rotation with reuse detection.
4. **Tectonic Subprocess Isolation:** LaTeX compilation uses the system binary invoked with the `--untrusted` flag, which disables shell escape (`\write18`) and filesystem access outside the per-compilation working directory. Document sources are additionally screened for absolute and parent-directory file references, and compiler output is not returned verbatim to the client.
5. **k-Anonymity Controls:** Aggregated statistical analysis endpoints enforce a minimum $k \ge 5$ class size threshold before outputting mean or standard deviation metrics.
6. **Access Control:** Every object-level endpoint resolves records under an ownership predicate bound to the authenticated teacher; cross-tenant reads and writes return 404 without disclosing whether the record exists.
7. **Rate Limiting:** Authentication endpoints are rate limited with a shared Redis-backed counter (registration, login and token refresh), bounding credential-guessing and the CPU cost of Argon2id verification.
8. **Storage Limitation:** Expired exams cascade a deletion deadline onto their student identities and submissions, which are then irreversibly deleted; audit entries are deleted after a configured period.

---

## 3. Data Subject Rights & Erasure

3.1 **Right to Erasure (Art. 17):** The Controller may execute an immediate, cascading hard-deletion of student identities and linked submission records via the API (`DELETE /api/v1/exams/{id}/students/{pseudonym_hmac}`) or the local settings management view. Student identities are scoped to a single exam, so this call erases the pupil's identity and submissions **for that exam only**; erasing a pupil across several exams requires one call per exam.
3.2 **Audit Trail:** Every deletion generates an immutable audit record in the `audit_logs` table capturing the Controller's email and a SHA-256 hash of the target record.

---

## 4. Sub-Processors

4.1 The Processor shall not engage sub-processors without prior written authorization from the Controller.

4.2 Current approved sub-processors. Art. 28(2) requires each to be **named**;
the placeholders below must be completed before this agreement is signed.

| Sub-processor | Purpose | Location | Transfer basis |
| :--- | :--- | :--- | :--- |
| Cloudflare, Inc. (Cloudflare Pages) | Hosting and delivery of the web interface | USA, with EU edge locations | EU–US Data Privacy Framework and/or SCCs — verify current status and record the transfer impact assessment |
| *[Database hosting provider]* | PostgreSQL 16 — encrypted payloads at rest | *[country]* | *[none required if EU/EEA]* |
| *[Cache hosting provider]* | Redis 7 — rate-limit counters | *[country]* | *[none required if EU/EEA]* |

4.3 **Third-country transfers.** The web interface is delivered by a
US-headquartered provider, so Chapter V GDPR applies even though the
application encrypts personal data in the browser before transmission. The
Controller must document the transfer basis and a transfer impact assessment
before deployment. Where the Controller self-hosts the web interface within the
EU/EEA, this row does not apply and should be removed.

4.4 **Scope of processor access.** The Processor cannot decrypt student
identity data, submission scans, or grading annotations: those are encrypted in
the data subject's browser with a key derived from the teacher's passphrase,
which is never transmitted. The Processor does have access to per-submission
scores in plaintext and to exam metadata (title, class, subject, date).
