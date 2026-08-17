# Data Protection Impact Assessment — Art. 35 GDPR

*Datenschutz-Folgenabschätzung (DSFA)*

---

## Part 1 — Screening: is a DPIA required?

**Conclusion: yes.** This is not left open. Two independent triggers apply, and either alone would suffice.

Art. 35(1) requires a DPIA where processing is "likely to result in a high risk". Art. 35(3) lists presumptive cases, and the Datenschutzkonferenz (DSK) publishes a list of processing operations for which a DPIA is mandatory in Germany.

| Criterion (Art. 29 WP248 / DSK) | Applies? | Why |
| :--- | :--- | :--- |
| Evaluation or scoring | **Yes** | The entire purpose is systematic assessment of pupil performance, producing grades with material consequences for the individual. |
| Data concerning vulnerable data subjects | **Yes** | Pupils are predominantly minors, in an inherent power imbalance with the school, and cannot meaningfully object (Recital 38, Recital 75). |
| Data processed on a large scale | Assess | Depends on deployment: a single teacher's classes is not large scale; a whole school or authority-wide rollout may be. *[Assess for your deployment.]* |
| Systematic monitoring | No | No behavioural monitoring; processing is limited to submitted work. |
| Innovative use of technology | Partial | Client-side zero-knowledge encryption and QR-based pseudonymisation are unusual, though they *reduce* rather than raise risk. |
| Automated decision-making with legal effect | **No — verify** | Grading is teacher-led. Multiple-choice auto-grading computes scores, but a human sets and reviews the final grade. If a deployment ever lets an automated score become a final grade without human review, Art. 22 engages and this assessment must be redone. |
| Preventing data subjects from exercising a right | No | Access and erasure are supported in the application. |

Two criteria are met (evaluation/scoring; vulnerable data subjects), so a DPIA is required before processing begins.

**Consultation duties:** Art. 35(2) — seek the DPO's advice, and document it. Art. 35(9) — where appropriate, seek the views of data subjects or their representatives; for a school this normally means the *Elternbeirat* and, where applicable, the staff council (*Personalrat*).

---

## Part 2 — The assessment

### 2.1 Systematic description of the processing — Art. 35(7)(a)

*[Complete for your deployment. Draw the data inventory from `legal_audit_dsgvo.md` §3 and the data flows from `data_flow_and_security.md`.]*

- Purpose and context: *[…]*
- Deployment shape: *[school self-hosted / third-party hosted]*; storage mode: *[`all-local` / `all-server` / `hybrid` — see `data_flow_and_security.md` §3]*
- Data categories, subjects and volumes: *[…]*
- Retention: *[…]*
- Recipients and sub-processors: *[…]*

### 2.2 Necessity and proportionality — Art. 35(7)(b)

Address each explicitly:

- **Necessity:** could the purpose be achieved with less personal data? Note that the design already pseudonymises submissions so that grading occurs against a pseudonym rather than a name — a data-minimisation measure that also serves grading objectivity.
- **Proportionality:** is the retention period the shortest compatible with statutory duties?
- **Legal basis:** Art. 6(1)(e) plus state school law — *[cite]*. Confirm that consent is **not** being relied on.
- **Data subject rights:** how access, rectification and erasure requests are handled in practice, and by whom.

### 2.3 Risk assessment — Art. 35(7)(c)

Rate each risk to the **rights and freedoms of the data subject**, not to the school.

| # | Risk | Source | Likelihood | Severity | Existing mitigation | Residual |
| :-- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Unauthorised disclosure of a pupil's exam paper or grade | Server compromise | *[…]* | High | Client-side AES-256-GCM; server never holds the key | *[…]* |
| R2 | Disclosure of grades via plaintext `total_score` on the server | Server compromise | *[…]* | Medium | Pseudonymous only; k ≥ 5 suppression on aggregates | *[…]* |
| R3 | Disclosure from a teacher's device — applies in `all-local` mode, and in `hybrid` mode for student identity/submission data specifically | Lost, stolen or shared device | *[…]* | High | Passphrase-derived key, not persisted; session auto-locks after 60 min | Session key is in `sessionStorage` while unlocked — an unattended unlocked device is exposed |
| R4 | Loss of pupil work | Forgotten passphrase; no recovery by design | *[…]* | Medium | `.bgproj` export as backup | Depends on whether teachers actually take backups |
| R5 | Data kept beyond its purpose | Retention job not scheduled | *[…]* | Medium | Automated cascade erasure with grace period | Requires the cron job to actually run — verify in deployment |
| R6 | Grade tampering | Compromised teacher account | *[…]* | High | Rate-limited auth, refresh-token reuse detection, append-only audit trail | *[…]* |
| R7 | Re-identification from pseudonymous data | Small class sizes | *[…]* | Medium | k ≥ 5 threshold on statistics | Small cohorts remain re-identifiable to insiders |
| R8 | Compromised third-party WASM module | Supply chain | *[…]* | High | — | **SRI is not enforced**; the Argon2 module that derives every key is loaded unverified |

*[Add deployment-specific risks. Complete the empty cells with the DPO.]*

### 2.4 Measures to address the risks — Art. 35(7)(d)

*[For each residual risk above, record the measure, its owner and its deadline. Where a residual risk is accepted, record who accepted it and on what basis.]*

**Known measures still outstanding at the time of writing** (see `legal_audit_dsgvo.md` §6):

- R5: schedule and monitor `python -m app.cli run-retention`; an unscheduled job means no erasure happens at all.
- R8: vendor and hash the WASM binaries, then set `"enforced": true` in `static/sri-manifest.json`.
- R3: decide and document the private-device policy for teaching staff.

### 2.5 Outcome

| Item | Entry |
| :--- | :--- |
| DPO consulted (Art. 35(2)) | *[date, name, summary of advice]* |
| Views of data subjects sought (Art. 35(9)) | *[date, forum — e.g. Elternbeirat — or reasoned decision not to]* |
| Residual risk after measures | *[low / medium / high]* |
| Prior consultation with the authority required (Art. 36)? | Required **only** if high residual risk remains after mitigation. *[If yes: consult BayLfD, or the authority competent for public bodies in your Land, before processing begins.]* |
| Decision | *[proceed / proceed with conditions / do not proceed]* |
| Approved by | *[name, role, date]* |

---

## Review

A DPIA is not a one-off. Re-assess when the processing changes — a new deployment mode, a new sub-processor, automated grading without human review, or a materially different data category — and at least annually.

| Version | Date | Author | Change |
| :--- | :--- | :--- | :--- |
| 1.0 | *[date]* | *[name]* | Initial assessment |
