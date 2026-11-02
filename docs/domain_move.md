# Move to another domain

A checklist for moving an installation from one domain to another without locking teachers out. Accounts, exams and exercises live on the server and move by themselves; the backend stays the same. Work through [Before you start](#before-you-start), then either the [generic checklist](#generic) or the [Cloudflare checklist](#cloudflare-like-the-maintainer), then [Troubleshooting](#troubleshooting) if something fails. The maintainer's own move, with real host names and dates, is in [deployment.md](deployment.md#domain-move-to-examance-de).

## Before you start {#before-you-start}

What does not move by itself:

- **Passkeys** belong to the domain they were made for (the WebAuthn relying party, the host of `FRONTEND_URL`). Browsers with *related origins* (Chrome, Edge and Safari as of 2026; not Firefox) can still use them on the new domain while the old domain answers `/.well-known/webauthn`. Examance lets each teacher sign in **once** that way and then asks for a new passkey. In Firefox, teachers sign in with password and authenticator code instead.
- **Results in hybrid mode** live in the browser storage of the old origin. The new origin cannot read them, so teachers move them to the server or export them first; the app guides them on the old address.
- **Browser-only things**: saved passwords, theme and other local preferences, installed apps.

The move has three phases: both addresses run (about two weeks), the old one forwards, then old passkeys stop working (e.g. two months later).

- [ ] Pick the **redirect date** (first day of phase 2) and the **end date** for old passkeys (phase 3); announce both to your teachers.
- [ ] Fill in your values; the checklists use these names:

| Name | Example | Yours |
|---|---|---|
| Old frontend | `old.example.org` | |
| Old API | `api.old.example.org` | |
| New frontend | `new.example.org` | |
| New API | `api.new.example.org` (default), or `PUBLIC_API_URL` | |

The API must share the frontend's registrable domain (`SameSite=Strict` cookies), so `api.<new frontend>` is the simplest choice.

## Generic {#generic}

Any static host for the frontend and any reverse proxy for the backend ([Host Examance](hosting.md)).

### Phase 1: both addresses run

- [ ] **DNS**: the new frontend host to your static host, the new API host to the server.
- [ ] **Reverse proxy**: a site for the new API host with the existing `reverse_proxy` ([section 4.4](hosting.md#_4-4-reverse-proxy)). **Keep** the old API site: until the redirect, the old frontend keeps calling the old API so its cookies stay on its own site.
  - Check: `curl -s https://api.new.example.org/api/health` answers `{"status":"ok",…}`.
- [ ] **Backend `.env`**, then restart:
  - `FRONTEND_URL=https://new.example.org/` (moves the passkey relying party and the e-mail links)
  - `FRONTEND_ORIGINS=["https://new.example.org","https://old.example.org"]`
  - `WEBAUTHN_LEGACY_RP_IDS=["old.example.org"]` (if `WEBAUTHN_RP_ID` was set explicitly, set it to the new host and put the old value here)
  - `ALLOWED_HOSTS`: the new API host and the old one
  - delete `CORS_ALLOWED_ORIGINS` and `CORS_ALLOWED_ORIGIN_REGEX` if still present (ignored since the move support)
  - optional: `SMTP_FROM_EMAIL` on the new domain, with SPF and DKIM
- [ ] **Frontend build variables** ([section 5.1](hosting.md#_5-1-build)), then rebuild and deploy to **both** hosts:
  - `PUBLIC_DOMAIN_MOVE_FROM=old.example.org`
  - `PUBLIC_DOMAIN_MOVE_FROM_API_URL=https://api.old.example.org`
  - `PUBLIC_DOMAIN_MOVE_TO=https://new.example.org`
  - `PUBLIC_DOMAIN_MOVE_REDIRECT_DATE=<redirect date>`
  - `PUBLIC_API_URL` only if the new API is not `api.new.example.org`
- [ ] Check: `curl -s https://old.example.org/.well-known/webauthn` lists `https://new.example.org`.
- [ ] Check in Chrome: the old address shows the move notice; the new address offers "Use the passkey from old.example.org" at sign-in and then asks for a new passkey; the new passkey opens your data after signing out and in again.

### Phase 2: forward (on the redirect date)

- [ ] Answer every request to the old frontend host with a 301 to the same path on the new one, **except `/.well-known/webauthn`**: browsers fetch it without following redirects, so it must still be served as JSON.

```
old.example.org {
    handle /.well-known/webauthn {
        root * /srv/examance
        header Content-Type application/json
        file_server
    }
    handle {
        redir https://new.example.org{uri} permanent
    }
}
```

  With nginx: `location = /.well-known/webauthn { root /srv/examance; default_type application/json; }` and `location / { return 301 https://new.example.org$request_uri; }`.
- [ ] `.env`: remove the old origin from `FRONTEND_ORIGINS` and the old API host from `ALLOWED_HOSTS`, restart. Remove the old API site and its DNS record.
- [ ] Check:

```bash
curl -sI https://old.example.org/.well-known/webauthn   # 200, application/json, no Location
curl -sI https://old.example.org/exams                  # 301 to https://new.example.org/exams
```

### Phase 3: finish (on the end date)

- [ ] `.env`: `WEBAUTHN_LEGACY_RP_IDS=[]`, restart. Old passkeys no longer sign in.
- [ ] Remove the `/.well-known/webauthn` exception (the whole old host may now redirect, or go).
- [ ] Drop the `PUBLIC_DOMAIN_MOVE_*` build variables and rebuild.

## Cloudflare, like the maintainer {#cloudflare-like-the-maintainer}

Frontend on Cloudflare Pages, proxied DNS, the backend behind Caddy with a Cloudflare Origin CA certificate and Authenticated Origin Pulls ([the maintainer's pipeline](deployment.md)). The [generic](#generic) `.env` and build-variable steps apply unchanged; this list replaces the DNS, proxy and redirect steps.

### Phase 1: both addresses run

- [ ] **Zone**: add the new domain to Cloudflare (if it is new) and switch its name servers.
- [ ] **SSL/TLS of the new zone** (each zone has its own settings; the old zone's do not carry over):
  - [ ] Encryption mode **Full (strict)**.
  - [ ] **Origin Server → Create certificate** for `new.example.org, *.new.example.org`; install it on the server next to the old one.
  - [ ] **Origin Server → Authenticated Origin Pulls**: on (zone-level). Without it Cloudflare sends no client certificate and Caddy's `require_and_verify` drops the handshake.
  - [ ] HSTS and Always Use HTTPS may stay on; Origin CA needs no ACME challenge, so no exception rule is needed.
- [ ] **Caddy**: one site block per certificate, because one `tls` line serves one certificate:

```
(cloudflare_tls_new) {
    tls /etc/caddy/certs/new.example.org.pem /etc/caddy/certs/new.example.org.key {
        client_auth {
            mode require_and_verify
            trust_pool file /etc/caddy/certs/cloudflare-origin-pull-ca.pem
        }
    }
}

api.new.example.org {
    import cloudflare_tls_new
    reverse_proxy 127.0.0.1:9002
}
```

  Keep the old API's block. Reload Caddy.
- [ ] **DNS** in the new zone: `api.new.example.org` (proxied) to the server.
  - Check: `curl -si https://api.new.example.org/api/health` answers 200. A **520** means the TLS step above is incomplete ([Troubleshooting](#troubleshooting)).
- [ ] **Pages → Custom domains**: add `new.example.org` to the right branch. **Keep the old domain attached**; it serves `/.well-known/webauthn` until phase 3.
- [ ] **Pages → Settings → Variables**: the generic build variables, per environment; delete `PUBLIC_DEFAULT_BACKEND_URL` if still present. Retry the latest deployment so they take effect.
- [ ] **GitHub → Environments**: `BACKEND_PUBLIC_URL=https://api.new.example.org/` (the deploy's health check).
- [ ] Backend `.env` as in the generic phase 1, then deploy or restart.

### Phase 2: forward (on the redirect date)

- [ ] **Old zone → Rules → Redirect Rules**, one rule per frontend host:
  - expression `(http.host eq "old.example.org" and http.request.uri.path ne "/.well-known/webauthn")`
  - dynamic target `concat("https://new.example.org", http.request.uri.path)`, status 301, preserve query string
- [ ] `.env` as in the generic phase 2; remove the old API's Caddy block and DNS record.
- [ ] The two `curl -sI` checks of the generic phase 2.

### Phase 3: finish (on the end date)

- [ ] `.env`: `WEBAUTHN_LEGACY_RP_IDS=[]`, restart.
- [ ] Delete the redirect rule's exception, or detach the old domain from Pages and drop the old zone's records.
- [ ] Drop the `PUBLIC_DOMAIN_MOVE_*` variables in Pages and retry the deployment.

## Troubleshooting {#troubleshooting}

| Symptom | Cause and fix |
|---|---|
| `curl` to the new API answers **520** (Cloudflare) | TLS between Cloudflare and the server fails: the Origin CA certificate does not cover the new host, or Authenticated Origin Pulls is off in the new zone while Caddy requires it. |
| Browser: "No 'Access-Control-Allow-Origin' header" on the API | Usually the API is not reached at all (check `/api/health` first). Otherwise the frontend's origin is missing from `FRONTEND_ORIGINS`, or the backend was not restarted. |
| Report-only CSP warning `connect-src 'none'` | Not from Examance; a Cloudflare zone feature or a browser extension. Harmless while report-only. |
| The new address does not offer the old passkey | Firefox (no related origins), or `/.well-known/webauthn` on the old host is redirected, missing, or not `application/json`. |
| The new passkey signs in but does not open data | The authenticator has no PRF support; the teacher opens data with password and recovery code, or another passkey. |
