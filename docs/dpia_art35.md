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
| Preventing data subjects from exercising a right | No | Access and erasure are supported in the application for signed-in users. A registrant still waiting for approval has no session and must ask the operator; their data is limited to an address, a password hash and an optional note (R14). |

Two criteria are met (evaluation/scoring; vulnerable data subjects), so a DPIA is required before processing begins.

**Consultation duties:** Art. 35(2) — seek the DPO's advice, and document it. Art. 35(9) — where appropriate, seek the views of data subjects or their representatives; for a school this normally means the *Elternbeirat* and, where applicable, the staff council (*Personalrat*).

---

## Part 2 — The assessment

### 2.1 Systematic description of the processing — Art. 35(7)(a)

*[Complete for your deployment. Draw the data inventory from `legal_audit_dsgvo.md` §3 and the data flows from `data_flow_and_security.md`.]*

- Purpose and context: *[…]*
- Deployment shape: *[school self-hosted / third-party hosted]*; storage mode (set per account, chosen explicitly at first sign-in): *[`all-server` / `hybrid` — see `data_flow_and_security.md` §3]*. Every user signs in with a server account; the former `all-local` mode (no account, data never leaves the device) was discontinued with issue #47
- Data categories, subjects and volumes: *[…]*  Include teacher-uploaded exercise resource files: arbitrary file types are permitted, so the content is not constrained by the schema. In both modes (`all-server` and `hybrid`) exercises and their resource files live on the server as plaintext blobs alongside the exercise LaTeX (a browser-side encrypted cache may exist, but the server copy is plaintext). The optional server LaTeX compile is stateless (temporary directory, nothing stored, no student data).
- Account registration (only where the operator sets `REGISTRATION_ENABLED`, off by default; issue #53): a person who registers is held in `registration_requests` as an e-mail address plus a SHA-256 hash of the verification token until the mailed link is used or expires (`REGISTRATION_TOKEN_TTL_HOURS`, default 24 hours). Using the link creates the account with the chosen password hash. An optional free-text note for the approving admin (up to 500 characters) is stored until the admin approves or rejects, and is discarded for an address on the admin's always-allowed domain list. Also stored per account: the approval timestamp and two feature switches (`allow_server_results`, `allow_server_latex`). The allowed-domain list (`allowed_email_domains`) holds no personal data. A pending account holds no token of any kind and can create no data. Rejected accounts are deleted at once, and pending accounts that nobody approves are erased after `PENDING_ACCOUNT_RETENTION_DAYS` (default 90). See `data_flow_and_security.md` §2, "Account registration and approval".
- Retention: *[…]*
- Recipients and sub-processors: *[…]* (include the mail provider behind `SMTP_HOST`, which sees registration, invitation, approval and reset mails)

### 2.2 Necessity and proportionality — Art. 35(7)(b)

Address each explicitly:

- **Necessity:** could the purpose be achieved with less personal data? Note that the design already pseudonymises submissions so that grading occurs against a pseudonym rather than a name — a data-minimisation measure that also serves grading objectivity.
- **Proportionality:** is the retention period the shortest compatible with statutory duties?
- **Legal basis:** Art. 6(1)(e) plus state school law — *[cite]*. Confirm that consent is **not** being relied on.
- **Data subject rights:** how access, rectification and erasure requests are handled in practice, and by whom. Include requests from a registrant who is still pending: they cannot sign in, so the in-app export and deletion are not open to them (R14).

### 2.3 Risk assessment — Art. 35(7)(c)

Rate each risk to the **rights and freedoms of the data subject**, not to the school.

| # | Risk | Source | Likelihood | Severity | Existing mitigation | Residual |
| :-- | :--- | :--- | :--- | :--- | :--- | :--- |
| R1 | Unauthorised disclosure of a pupil's exam paper or grade | Server compromise | *[…]* | High | Client-side AES-256-GCM; server never holds the key | *[…]* |
| R2 | Disclosure of grades via plaintext `total_score` on the server | Server compromise | *[…]* | Medium | Pseudonymous only; k ≥ 5 suppression on aggregates | *[…]* |
| R3 | Disclosure from a teacher's device — applies in `hybrid` mode, where student identity, scans and scores are kept only in the browser (IndexedDB, encrypted); in `all-server` mode only the encrypted local cache and the unlocked session are exposed. *Previously (until issue #47) this risk was scoped to the discontinued `all-local` mode and a local passphrase.* | Lost, stolen or shared device | *[…]* | High | Data key comes from the account's key envelope (password, passkey or recovery code; never sent to the server) and is not persisted; session auto-locks after 60 min | Session key is in `sessionStorage` while unlocked — an unattended unlocked device is exposed |
| R4 | Loss of pupil work | Forgotten password | *[…]* | Low | The data key is wrapped per factor, so a reset re-wraps it rather than orphaning the vault; a printable recovery code is the always-available fallback, plus `.bgproj` export | Residual risk is a teacher who loses **both** their password and their recovery code — recoverable by nobody, including the operator, by design |
| R5 | Account takeover via the teacher's mailbox | Password reset used to need only the emailed link | *[…]* | Low | Reset requires a second factor (authenticator or passkey) alongside the link | Accounts that never finished enrolling still reset on the link alone; they hold one factor and are forced to enrol at the next sign-in |
| R6 | Online password guessing | Sign-in exposed to the internet | *[…]* | Low | A user-verified passkey, or two of three factors, required — a password never suffices alone; per-account failed-attempt cooloff on top of the IP-keyed limits | The cooloff is capped and self-expiring, which is a deliberate trade: an uncapped lock would let anyone who knows an address deny its owner access |
| R5 | Data kept beyond its purpose | Retention job not scheduled | *[…]* | Medium | Automated cascade erasure with grace period | Requires the cron job to actually run — verify in deployment |
| R6 | Grade tampering | Compromised teacher account | *[…]* | High | Rate-limited auth, refresh-token reuse detection, append-only audit trail | *[…]* |
| R7 | Re-identification from pseudonymous data | Small class sizes | *[…]* | Medium | k ≥ 5 threshold on statistics | Small cohorts remain re-identifiable to insiders |
| R8 | Compromised third-party WASM module | Supply chain | *[…]* | High | — | **SRI is not enforced**; the Argon2 module that derives every key is loaded unverified |
| R9 | Re-identification of a donated MC training-data crop | Opt-in checkbox-crop donation (`omr_training_samples`) | Low | Medium | Tight 80×48 grayscale crop with no question text; no exam/submission/pupil/teacher id and no IP stored; the only id is a random per-box token that exists solely to supersede a corrected label | The server knows the donating account while the request runs (needed for the quota) — the operator could link a request to an account in that moment; a handwriting or margin-content correlation across one teacher's crops remains |
| R10 | Poisoning of the shared training set / storage exhaustion | Donation endpoint writing into the production database | Low | Medium | Full session required (an account holds no token until an admin approved it or its domain is on the admin's allowlist); per-account and global daily quotas; strict request validation (`extra="forbid"`); consistency filtering at training time; `TRAINING_DONATION_ENABLED` kill switch | A compromised or malicious account can still donate plausible-looking bad labels within its quota |
| R11 | Fake or spam sign-ups, and mail bombing of a third party's address through the public registration form | Self-registration enabled (`REGISTRATION_ENABLED`); anyone can submit any address | Medium | Low | Per-IP limit of 20 per hour on `POST /auth/register` and `/auth/register/complete`; at most one verification mail per address per `REGISTRATION_RESEND_COOLDOWN_SECONDS` (default 300); no mail at all for an address that already has an account; mails are sent from a background task; a new link invalidates the old one; nothing is created before the link is used, and an account created afterwards stays pending (no token, can create no data) until an admin approves it; unverified requests expire after `REGISTRATION_TOKEN_TTL_HOURS` (default 24) and unapproved accounts are purged after 90 days | A distributed attacker can still send a low volume of verification mails to a victim's address, and can fill the pending list with accounts that confirmed real mailboxes; the operator can switch registration off (`REGISTRATION_ENABLED=false`) |
| R12 | Abuse of the always-allowed domain list: a mis-listed domain approves anyone holding an address there | Admin error (e.g. listing a public mail provider), or a school domain that hands out addresses freely | Low | Medium | The Admin UI warns never to list public providers; the match is exact (no wildcards, no subdomains, plain hostnames only); a domain change affects future registrations only, never existing accounts; every add, change and removal is in the audit trail (`ALLOWED_DOMAIN_*`); an auto-approved account holds only the features its domain entry grants | Nothing in the software can tell a sensible entry from a careless one; the admin's judgement is the control. A newly approved account can still use whatever its features allow, so keep the default features of a domain entry as narrow as the school needs |
| R13 | Account-existence oracle: telling whether an address has an account here | Unauthenticated probing of the registration, reset and sign-in endpoints | Low | Low | `POST /auth/register` always answers `202` with the same message; mail is sent after the response so timing is the same (also for `/auth/forgot-password`); a pending account is revealed only after the correct password was proven, a wrong one gives the same `401` as an unknown address; the admin notice mail carries no registrant data | Only the holder of the mailbox can tell the difference (a mail arrives or it does not); that is inherent in mail verification |
| R14 | A registrant pending approval cannot exercise access and erasure through the application | Pending accounts hold no token, so the in-app export (`GET /user/me/export`) and deletion (`DELETE /user/me`) are unavailable to them | Low | Low | Data held is minimal (address, password hash, optional note, creation time) and short-lived: an admin rejection deletes the account at once, and the retention job erases unapproved accounts after `PENDING_ACCOUNT_RETENTION_DAYS` (default 90); the rejection mail tells the person who to contact | The operator must answer a request under Art. 15 or 17 from a pending registrant by hand (the address is in `teachers`, and in `registration_requests` before verification); document who does it |

*[Add deployment-specific risks. Complete the empty cells with the DPO.]*

### 2.4 Measures to address the risks — Art. 35(7)(d)

*[For each residual risk above, record the measure, its owner and its deadline. Where a residual risk is accepted, record who accepted it and on what basis.]*

**Known measures still outstanding at the time of writing** (see `legal_audit_dsgvo.md` §6):

- R5: schedule and monitor `python -m app.cli run-retention`; an unscheduled job means no erasure happens at all.
- R8: vendor and hash the WASM binaries, then set `"enforced": true` in `static/sri-manifest.json`.
- R3: decide and document the private-device policy for teaching staff.
- R9: keep crops tight and id-free as implemented; re-review if the crop is ever widened to include more page context.
- R10: monitor training-time consistency filtering results and daily volume against `TRAINING_SAMPLES_PER_DAY_MAX`; lower the quotas or use the kill switch if abuse is observed.
- R11: watch registration volume and the pending list; keep the mail provider's own sending limits in place; turn registration off with `REGISTRATION_ENABLED=false` if it is abused. Registration requires working SMTP, so decide who watches the sending reputation of that account.
- R12: before adding a domain, confirm that the institution controls who gets an address there; never list a public provider; review the `ALLOWED_DOMAIN_*` audit entries periodically.
- R13: no outstanding measure; re-test the identical-answer property whenever a registration, reset or sign-in endpoint changes.
- R14: name the person who answers access and erasure requests from pending registrants, and record the procedure.

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

A DPIA is not a one-off. Re-assess when the processing changes — a new deployment mode, a new way accounts are created (self-registration, issue #53, is such a change), a new sub-processor, automated grading without human review, or a materially different data category (teacher-uploaded resource files are such a category: unconstrained file content attached to exercises) — and at least annually.

| Version | Date | Author | Change |
| :--- | :--- | :--- | :--- |
| 1.0 | *[date]* | *[name]* | Initial assessment |
