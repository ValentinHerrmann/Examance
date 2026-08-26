# GDPR Incident & Data Breach Response Checklist

> **Regulatory Requirement:** GDPR Article 33 requires notification to the supervisory authority within **72 hours** of becoming aware of a personal data breach, unless the breach is unlikely to result in a risk to the rights and freedoms of natural persons.

## Who to contact — fill in before deployment

| Role | Who | Contact |
| :--- | :--- | :--- |
| Data Protection Officer | *[name]* | *[email / phone]* |
| Controller (school) contact | *[name]* | *[email / phone]* |
| Competent supervisory authority | **Bayerischer Landesbeauftragter für den Datenschutz (BayLfD)** — the authority for Bavarian *public* bodies, including state schools. Wagmüllerstraße 18, 80538 München. (BayLDA is for the private sector and is **not** competent here.) For another Land, name the authority competent for public bodies there. | *[link to the authority's online breach form]* |
| Owner of the 72-hour clock | *[named person, plus deputy]* | — |

> The 72 hours run from **awareness**, not from confirmation. Start the clock and
> notify with what is known; Art. 33(4) explicitly allows information to be
> supplied in phases.

**If you are the Processor, not the Controller:** Art. 33(2) obliges you to
notify the Controller **without undue delay** after becoming aware — there is no
72-hour allowance for that step, and it is the Controller who notifies the
authority. Do this first, before Phase 2 below.

---

## Phase 1: Immediate Containment (Hours 0 – 4)

- [ ] **1. Revoke Refresh Tokens & Sessions:** Execute database command to invalidate active sessions for compromised accounts:
  ```sql
  UPDATE refresh_tokens SET revoked = true WHERE teacher_id = '<COMPROMISED_TEACHER_ID>';
  ```
- [ ] **2. Rotate Application Secrets:** Immediately update `SECRET_KEY` in environment configuration and restart backend workers.
- [ ] **3. Inspect Immutable Audit Logs:** Query `audit_logs` table for suspicious `EXPORT` or `DELETE` activities:
  ```sql
  SELECT * FROM audit_logs WHERE created_at >= NOW() - INTERVAL '24 hours' ORDER BY created_at DESC;
  ```
- [ ] **4. Isolate Infrastructure:** If server compromise is suspected, isolate the application container network while preserving database logs.

---

## Phase 2: Impact Assessment (Hours 4 – 24)

- [ ] **4b. Force re-authentication.** Revoking refresh tokens ends every live session; `POST /admin/users/{id}/reset-factors` additionally clears an account's authenticator and passkeys where those may have been compromised. Neither touches the teacher's data key — the server cannot read it, which is also why neither can restore access to the data.
- [ ] **5. Determine Exposure Scope:**
  - Verify whether encrypted PII blobs (`pii_ciphertext`) were accessed.
  - Verify separately whether **plaintext** data was accessed: per-submission `total_score`, exam metadata (title, class, subject, date), teacher email addresses, and audit entries are **not** encrypted server-side.
- [ ] **6. Assess whether the Art. 34(3)(a) encryption exemption actually applies.** It exempts you from notifying data subjects only where the data is unintelligible to the attacker. Do not assert it without checking all of the following; if any is false, the exemption does not hold:
  - The compromise was limited to server-side storage, and no client device or browser profile was involved. Session keys live in `sessionStorage` on the teacher's device while unlocked, and in `all-local` mode the vault lives only there.
  - No passphrase or recovery code was compromised. The `key_envelopes` table holds the data key wrapped under an Argon2id key derived from each — a weak or reused password is offline-guessable against an exfiltrated dump, and so is a recovery code someone stored badly. The table itself gives an attacker nothing else: the wraps are ciphertext, the salts and KDF parameters are public by design, and no factor's secret is stored beside them.
  - The `mfa_credentials` secrets are the one exception to "the server holds nothing usable". They are encrypted under a key derived from `SECRET_KEY`, so a database dump alone does not yield working authenticator seeds — but a dump **plus** the environment does. If `SECRET_KEY` may have leaked, treat every TOTP enrollment as compromised and force re-enrollment.
  - Passkey rows (`webauthn_credentials`) contain no secrets: public keys are public by construction, and `prf_salt` is the PRF *input*. A stolen copy does not let anyone authenticate or decrypt.
  - The affected vaults were not written before the PBKDF2 iteration increase (1,000 → 600,000). Data still readable via the legacy decrypt path has materially weaker protection.
  - Only encrypted fields were exposed — see item 5.
- [ ] **7. Determine Data Subject Impact:** Identify affected exams and number of enrolled students. Where minors are affected, weigh the heightened risk (Recital 38) in the Art. 34 assessment.

---

## Phase 3: Regulatory Notification (Hours 24 – 72)

- [ ] **8. Notify the Competent Supervisory Authority (Art. 33):** If unencrypted PII or master key compromise occurred, file formal notification containing:
  - Description of the nature of the breach.
  - Name and contact details of Data Protection Officer (DPO).
  - Likely consequences of the breach.
  - Measures taken or proposed to address the breach.
- [ ] **9. Data Subject Notification (Art. 34):** If high risk to individuals is established, notify affected students/teachers without undue delay.

---

## Phase 4: Post-Mortem & Remediation

- [ ] **10. Root Cause Analysis:** Document entry vector (e.g. credential theft, CORS misconfiguration, dependency vulnerability).
- [ ] **11. Re-verify SRI & Dependency Integrity:** Run `npm run sri:verify` and `pip-audit`. Note that SRI is currently declared `"enforced": false` in `static/sri-manifest.json` — that step reports the absence of the control, not its success.
