# Opt-in training-data donation

Code: `frontend/src/lib/services/trainingDonation.ts`, `backend/app/routers/training.py`.

80×48 crops of *verified* MC boxes go to the configured backend's `POST /training/omr-samples`.

- **Requires a full session.** A public write into the prod DB was judged too dangerous, so only signed-in users can donate. Since the local no-account mode was discontinued (issue #47), every user has an account.
- **The account is used only for the daily quota** (hashed key in `ephemeral_store`) plus a global cap. Never store, log or audit it together with a sample, and keep the table free of foreign keys.
- **Quota answers are 429 without `Retry-After`**, and there is no slowapi limit on that POST. `client.ts` starts the *login* lockout on any 429 that carries `Retry-After`, so adding one here would lock people out of login.
- Uploads go through `api.post(..., { silentError: true })`.
- **The only id in a sample is a random per-box `sample_token`**, kept in the sealed `omrMeta.donation.tokens`. Re-donating a corrected box reuses it so the server replaces the row.
- **Consent is off by default** (`bg_omr_donation`, versioned). Withdrawal or sign-out drops everything unsent.
- Changing what is sent means bumping `DONATION_CONSENT_VERSION` and the privacy text (`legal.datenschutz.section10`).
