# Moving to a new domain

How an installation moves its frontend and API to new host names without locking anyone out (issue #198). The maintainer's own move is the worked example:

| | Old | New |
|---|---|---|
| Production frontend | `examance.valentin-herrmann.com` | `examance.de` |
| Production API | `api-examance.valentin-herrmann.com` | `api.examance.de` |
| Preview frontend | `prev-examance.valentin-herrmann.com` | `preview.examance.de` |
| Preview API | `prev-api-examance.valentin-herrmann.com` | `preview-api.examance.de` |

Both addresses run against **the same backend and database** until a deadline (default: 7 December 2026), then the old ones are switched off.

## What moves by itself, and what does not {#what-moves}

- **Exams, exercises and (in `all-server` mode) results** live on the server: they are there on the new address straight away.
- **Passkeys do not move.** A passkey is bound to its RP ID, the frontend's host name. Passkeys made for the old domain sign in on the new one only through *related origins* (below), and only in browsers that support them (Chrome, Edge and Safari as of 2026; not Firefox). Every teacher adds a new passkey on the new address.
- **Hybrid results do not move.** They live in IndexedDB, which belongs to one origin. Teachers either switch to `all-server` before and back after, or back up the workspace and import it on the new address.
- **Browser-only state** (theme, recent server entries, saved passwords in password managers, installed PWA) stays with the old origin.

## How the transition works {#how}

- **Backend**: `WEBAUTHN_RP_ID` (derived from `FRONTEND_URL`) is the new domain; `WEBAUTHN_LEGACY_RP_IDS` lists the old one. Each ceremony picks the RP ID that fits the request's `Origin` (`rp_id_for_origin`, `app/services/webauthn.py`) and carries it in the challenge handle, so the old frontend keeps working with old passkeys. New passkeys are refused on the old address (`409 ERR_PASSKEY_OLD_ADDRESS`): they would die with it. `webauthn_credentials.rp_id` records each passkey's domain; passkeys from before this column are filled in at their next sign-in and count as old meanwhile.
- **Related origins**: every Pages build writes `/.well-known/webauthn` (`frontend/scripts/related-origins.mjs`) listing the new origin. Served on the old domain, it lets the new address ask for passkeys of the old RP ID ("Use a passkey of the old address", `POST /webauthn/login/options` with `{"legacy": true}`). The PRF output is the same, so such a passkey also opens the encrypted data.
- **Frontend**: the build knows the move (`frontend/scripts/domain-move.mjs`, overridable with `PUBLIC_DOMAIN_MOVE_FROM`, `_FROM_BACKEND_URL`, `_TO`, `_DEADLINE`; an empty `PUBLIC_DOMAIN_MOVE_FROM` switches it off). On the old address it shows a warning with the deadline and a checklist and keeps fresh browsers on the old API (same site, so cookies stay first-party); on the new address it reminds accounts that only have old passkeys to add one.

## Operator checklist {#checklist}

Do production and preview the same way, each with its own values. Keep the old entries until the deadline.

**Before the release that contains the move**

- [ ] DNS: create `examance.de`, `preview.examance.de` (CNAMEs for Cloudflare Pages) and `api.examance.de`, `preview-api.examance.de` (A/AAAA to the backend host). Keep the old records.
- [ ] Cloudflare Pages → Custom domains: add `examance.de` to `release` and `preview.examance.de` to the `preview` branch; keep the old domains attached (they must serve `/.well-known/webauthn`).
- [ ] Caddy: add the new API host names to the existing site blocks, e.g. `api.examance.de, api-examance.valentin-herrmann.com { reverse_proxy 127.0.0.1:9002 }`, and reload.
- [ ] Cloudflare Pages → Variables, per environment: set `PUBLIC_DEFAULT_BACKEND_URL` to the new API (`https://api.examance.de`, `https://preview-api.examance.de`). If set, `PUBLIC_PROD_BACKEND_URL` / `PUBLIC_PREVIEW_BACKEND_URL` too. Optional: `PUBLIC_DOMAIN_MOVE_DEADLINE`.
- [ ] GitHub → Settings → Environments, per environment: set `BACKEND_PUBLIC_URL` to the new API address with trailing slash (the deploy health check and the environment link use it).

**`.env` of each stack** (`$DEPLOY_APP_DIR/prod/.env`, `$DEPLOY_APP_DIR/preview/.env`)

- [ ] `FRONTEND_URL=https://examance.de/` (preview: `https://preview.examance.de/`). This also moves the passkey RP ID and the links in e-mails.
- [ ] `WEBAUTHN_LEGACY_RP_IDS=["examance.valentin-herrmann.com"]` (preview: `["prev-examance.valentin-herrmann.com"]`). Only needed when `WEBAUTHN_RP_ID` was not set explicitly; if it was, change it to the new host and put the old value here.
- [ ] `CORS_ALLOWED_ORIGINS`: add the new frontend, keep the old one, e.g. `["https://examance.pages.dev","https://examance.de","https://examance.valentin-herrmann.com"]`.
- [ ] `ALLOWED_HOSTS`: add the new API host, keep the old one, e.g. `["api.examance.de","api-examance.valentin-herrmann.com","127.0.0.1","localhost"]`.
- [ ] **Delete `CORS_ALLOWED_ORIGIN_REGEX`.** The option is gone: the backend ignores it, so every origin it used to admit must now be in `CORS_ALLOWED_ORIGINS`. (The compose file never passed it to the container, so a deployed stack loses nothing.)
- [ ] `SMTP_FROM_EMAIL`: ideally an address on the new domain (with SPF/DKIM for it), so links and sender share one registrable domain.
- [ ] Restart the stack (`$COMPOSE up -d`) or let the next deploy do it; the migration `0049_webauthn_credential_rp_id` runs with it.

**Check**

- [ ] `curl -s https://api.examance.de/api/health` and the old API both answer.
- [ ] `curl -sI https://examance.valentin-herrmann.com/.well-known/webauthn` answers `200` with `content-type: application/json`, and the body lists `https://examance.de`.
- [ ] On the old address: the move warning shows; sign-in with password and with an existing passkey works.
- [ ] On the new address: password sign-in works, "Use a passkey of the old address" signs in with an old passkey (Chrome), adding a new passkey works and the reminder disappears.

**After the deadline**

- [ ] `.env`: empty `WEBAUTHN_LEGACY_RP_IDS`, remove the old origin from `CORS_ALLOWED_ORIGINS` and the old host from `ALLOWED_HOSTS`; restart.
- [ ] Caddy, Pages custom domains, DNS: remove the old names (or redirect the old frontend to the new one; a redirect breaks related origins, so only after the deadline).
- [ ] Code: delete the defaults in `frontend/scripts/domain-move.mjs` and the old hosts in the workflows' fallbacks.
