# User & Account Management

Guide for creating and managing teacher and administrator accounts in **Examance**.

An account comes into being in one of four ways: the initial admin bootstrap (§1), an admin's invitation (§2), the CLI (§1 and the quick reference), or self-registration (§7, always available). Every account is either **approved** or **pending**. Only an approved account can sign in; a pending account holds no session, no enrollment token and no reset link of any kind until an admin approves it.

---

## 1. Initial Admin Bootstrap (Automatic Startup)

The system automatically creates an initial admin account on application startup if configured in `.env`:

```env
INITIAL_ADMIN_EMAIL=admin@school.com
INITIAL_ADMIN_PASSWORD=SuperSecureAdminPassword123!
```

When the backend starts, it checks if an account with `INITIAL_ADMIN_EMAIL` exists. If not, it creates an `admin` account with the specified password, already approved. If the account exists with the matching credentials but was left unapproved, the bootstrap approves it.

Alternatively, an admin account can be created manually via the CLI (the account is created approved):
```bash
python -m app.cli create-user --email admin@school.com --role admin --allow-admin
```

---

## 2. Invitations (Admin-Driven Account Creation)

Admins invite users in the Admin UI or via the API (`POST /api/v1/admin/users`).

1. Open the Admin UI and click **User Management**.
2. In the invite form, enter the **Email**, select the **Role** (`Teacher` or `Admin`) and set the account's **features** (see §7.3; both are on by default).
3. Click **Send invitation**.

The backend creates the account **approved**, with the chosen features and an uninitialized password (`password_hash = None`), and mails a single-use set-password link with invitation wording. The user opens the link to set their password prior to logging in. The address counts as verified: the mailed link is the only way into the account, so using it proves the mailbox.

Edge cases:
- If a self-registration for the same address is still waiting for its verification link, the invitation supersedes it and the registration link stops working.
- If a self-registered account for the address is already pending approval, the call is refused with `409 ERR_ACCOUNT_PENDING`: approve or reject that registration instead. Any other existing account gives `409 ERR_ACCOUNT_EXISTS`.
- An invitation nobody has accepted yet shows up in the account list with the status **Invited** and a **Resend invitation** action (the same endpoint as the admin-forced reset in §5).

A freshly invited account holds no key envelope and no data, so its first password setup skips the recovery-code step (`/auth/reset/start` answers `needs_key_recovery: false`); the recovery code is created and shown at the end of the first sign-in, as described in §2b.

---

## 2b. Sign-in factors

A sign-in needs **a passkey on its own, or two of three** factors: password,
authenticator app (TOTP), passkey. A passkey suffices alone because every passkey
ceremony requires user verification (fingerprint, face or device PIN); password
and authenticator never do. After a password, an account with a passkey gets the
passkey prompt automatically — cancelling it leaves the other factors on offer.
A passkey without PRF signs in but cannot open the encrypted data, so the
password or recovery code is asked for afterwards. An account with fewer than two is held on the enrollment screen
and can reach nothing else — including every existing account, on its first
sign-in after this shipped.

The two are yours to pick, in either order. Whichever factor opens the sign-in,
the screen then offers whatever the account can still present — password,
authenticator or passkey — and the server, not the browser, decides that list.
A passkey identifies the account on its own, so it can go first; an
authenticator code cannot, so it is second-position only.

Enrol all three where you can. With three enrolled, losing any one of them is an
inconvenience; with exactly two, losing one is a lockout that only an
administrator can clear, and only by resetting the factors — not the data.

**A passkey signs you in; it does not always open your data.** That needs the
WebAuthn PRF extension, which not every authenticator implements. Every ceremony
asks for the PRF secret using one application-wide input — a public
domain-separation value, not a secret; the derived secret is still unique per
credential because the authenticator's PRF key is. A per-credential input cannot
work: it would have to be chosen before the ceremony, and a sign-in does not yet
know which passkey will answer. Sign in with a
non-PRF passkey plus an authenticator code and both factors are genuinely
proven, but nothing in that pair can unwrap the encryption key — so the app asks
once for your password, or your recovery code, to decrypt. **Settings →
Sign-in & security** says which of your passkeys can do it.

Backup codes stand in for the authenticator, not for a third factor. Ten are
issued at enrollment, each usable once; regenerate them from **Settings →
Sign-in & security** when few are left. They are stored as a digest keyed from
`SECRET_KEY` rather than as a password hash — a machine-generated code has no
dictionary behind it, so the key, not a work factor, is what a database dump
runs into.

They are shown together with the recovery code on one screen at the end of the
first sign-in, because the two are easily mistaken for each other. They are not
the same thing: a backup code gets you *into the account* without your phone,
and the recovery code gets you back into your *encrypted data* without your
password. Keep both.

---

## 3. Sign-in & security (`/settings/security`)

Everything about an account's factors lives on one page, reached from
**Settings → Sign-in & security**. For each factor it shows whether it is set
up, when it was added, when it last answered a sign-in, and — the part that is
otherwise invisible — whether it can also *decrypt* the account's data. An
authenticator cannot: its secret lives server-side and six digits carry no
entropy to derive a key from. The page warns when an account sits at exactly the
minimum number of factors, or has only one that can open its data.

From there a teacher can:

- **Change their password** without signing out. The data key is unwrapped in
  the browser, re-wrapped under the new password, and written in the same
  request as the password itself, so the two cannot end up disagreeing. Nothing
  is re-encrypted, passkeys and the recovery code keep working, and the browser
  making the change stays signed in — every other device is signed out.
- **Set up or remove the authenticator**, and regenerate backup codes.
- **Register or remove passkeys**, each labelled with whether its authenticator
  supports PRF and can therefore open the data.
- **Replace the recovery code.** The old one stops working. The code itself can
  never be read back — the server holds a wrap it cannot open — so replacing it
  is the only remedy for one that has been mislaid.

Removing a factor is refused when it would leave the account below two factors,
or below its last means of decrypting its own data. The refusal names which of
the two rules it hit.

---

## 4. Self-Service Password Reset

Users can request a password reset at any time:
1. Navigate to `/forgot-password` on the frontend (or click **Forgot Password?** on the login page).
2. Enter the registered email address.
3. If an approved account exists, a single-use reset link (`/reset-password?token=...`) is delivered via email (expires in 24 hours). An account that is still waiting for approval (§7) gets no link, and the answer on screen is the same either way. The mail is sent after the response, so the response time does not reveal whether the address has an account.
4. Enter a new password (min. 12 characters).
5. Confirm with a second factor — an authenticator code or a backup code. An
   emailed link on its own no longer resets a password: anyone who could read the
   mailbox could otherwise take the account. (An account that has not finished
   enrolling has no second factor to offer, so the link carries the reset alone.)
6. Enter the **recovery code**. The data key is unwrapped in the browser and
   re-wrapped under the new password; nothing is re-encrypted and no data is
   lost. A fresh recovery code is issued and shown once. (A fresh account, one
   that holds no key envelope and has authored no exam or exercise, has nothing
   to recover: this step is skipped, which is the case for every new invitee.)
7. Sign in with the new password and your second factor. An authenticator code
   is single-use, so the one that authorised the reset moments ago will be
   refused — the screen says to wait for the next one rather than calling it
   invalid, and the refusal does not count towards the lockout.

**Without the recovery code**, the next sign-in offers two ways on. A
PRF-capable passkey opens the data outright, because a reset invalidates only
the *password* copy of the key. Failing that, starting fresh mints a new data
key: the account works again immediately, and every existing exam, student
record and grade stays sealed for good — as do the registered passkeys, which
have to be added again from **Settings → Sign-in & security**.

> **Keep the recovery code.** It is shown exactly once, when the key is first
> stored (on the first sign-in after this feature ships) and again after every
> reset. It is the only factor that always works. Without it *and* without the
> old password, the account's existing exams, student data and grading stay
> permanently unreadable — nobody, including an administrator, can recover them,
> because the server never holds the data key.
>
> Data created after a reset is unaffected either way.

---

## 5. Admin-Forced Password Reset

Admins can trigger a password reset for any existing user via the Admin UI or CLI:
- **Admin UI**: Click **Reset Password** next to the user in **User Management**.
- **CLI**: `python -m app.cli send-password-reset --email user@school.com`

For an invited account that never set a password, the same action resends the invitation. It is refused for an account that is still pending approval (`409 ERR_ACCOUNT_PENDING`): such an account has no reset link until it is approved.

**Behavior:** The user's existing password remains operational until they complete setting a new password via the emailed reset link. Once reset, all active sessions and refresh tokens are revoked, forcing re-authentication across all devices.

**A teacher locked out of a factor** — phone lost, backup codes gone — is cleared
with `POST /admin/users/{id}/reset-factors`. That removes their authenticator and
passkeys, revokes their sessions, and drops the key wraps those passkeys held;
they enrol again at the next sign-in. It restores the *account*, not the data:
the recovery code remains the way back to the exams themselves.

**An admin cannot restore a user's data.** Setting a password server-side — through
the Admin UI, `send-password-reset`, or `set-password` — marks the password copy of
that user's data key unusable, because the server has no way to re-wrap a key it
has never seen. The user regains access by entering their recovery code on the next
sign-in. This is a property of the encryption model, not a missing feature: an admin
who could recover the data could also read it.

---

## 6. Troubleshooting: Initial Admin Bootstrap

If `POST /api/v1/auth/login` returns `401 Unauthorized` for the initial admin account configured in `.env`:

1. **Check container logs**:
   ```bash
   docker compose -p examance-preview -f docker-compose.deploy.yml logs backend | grep -i bootstrap
   ```
2. **Interpret the log output**:
   - **`INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD not set...`**: Verify `.env` on the server contains non-empty `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD`. Ensure values containing `#` are enclosed in double quotes.
   - **`Initial admin user (...) already exists, but credentials or role do not match...`**: The account was created earlier under different credentials or role. Bootstrap will not overwrite existing accounts. Reset the password via CLI:
     ```bash
     docker compose -p examance-preview -f docker-compose.deploy.yml --env-file .env exec backend python -m app.cli set-password --email <admin-email>
     ```
   - **No log output**: `LOG_LEVEL` may be set above `INFO` or the container was not recreated after updating `.env`. Force recreate the backend container:
     ```bash
     docker compose -p examance-preview -f docker-compose.deploy.yml --env-file .env up -d --force-recreate backend
     ```

---

## 7. Self-Registration, Approval and Features

Self-registration lets a teacher ask for an account without an invitation (issue #53). It is always available: there is no switch to turn it off, because an account it creates can do nothing until it is approved (§7.3) or comes from a domain an admin allow-listed (§7.4).

### 7.1 Settings

| Setting | Default | Meaning |
| :--- | :--- | :--- |
| `REGISTRATION_TOKEN_TTL_HOURS` | `24` | How long the mailed verification link works. |
| `REGISTRATION_RESEND_COOLDOWN_SECONDS` | `300` | Minimum gap between two verification mails to the same address. |
| `PENDING_ACCOUNT_RETENTION_DAYS` | `90` | Verified accounts nobody approved are erased after this many days (§7.5). |

Registration needs working mail delivery (`SMTP_HOST`): without it the verification link never arrives. Every failed delivery is logged; in development without `SMTP_HOST` the mail, link included, is written to the log instead.

### 7.2 The flow

1. The person opens `/register` and enters an e-mail address (`POST /api/v1/auth/register`, 20 per hour per IP).
2. The server always answers `202` with the same generic message. It mails a link `{FRONTEND_URL}/verify-email?token=...` only when no account exists for the address, and not again within the resend cooldown. A new link replaces the old one. Mails are sent after the response, so neither the answer nor its timing reveals whether an account exists.
3. Until the link is used the address lives only in the table `registration_requests` (address, SHA-256 hash of the token, expiry, last-sent time). No account exists yet, so the `teachers` table holds verified addresses only.
4. The link opens `/verify-email`, where the person chooses a password (12 to 256 characters) and may leave an optional note for the admin (up to 500 characters). `POST /api/v1/auth/register/complete` (20 per hour per IP) claims the single-use token and creates the account. An invalid, used or expired link gives `400 ERR_INVALID_REGISTRATION_TOKEN`.
5. Two outcomes:
   - The address's domain is on the **always-allowed list** (§7.4): the account is approved at once, with that domain's features, and the note is discarded. The page tells the person to sign in.
   - Any other address: the account is **pending**. The note is stored with the account, and every approved admin gets a notice mail. The notice carries only a count and a link to the Admin UI, never the registrant's address or note, and is throttled: none is sent if another pending account arrived within the last 15 minutes.
6. No session is issued by either outcome. The person signs in normally afterwards and sets up the second factor then (§2b). Signing in with a pending account answers `approval_pending`, with no cookie, but only after a factor (the password) was proven: a wrong password gets the same `ERR_INVALID_CREDENTIALS` as an unknown address, so the answer does not reveal which addresses are registered.

### 7.3 Approval and features (Admin UI, `/admin/users`)

The Admin UI lists pending registrations with their note. For each, an admin chooses the account's **features** and then approves, or rejects.

- **Approve** (`POST /admin/users/{id}/approve`): sets `approved_at`, applies the features, erases the note and mails "approved, sign in". Two admins approving at once send one mail; the second gets `409 ERR_ALREADY_APPROVED`.
- **Reject** (`POST /admin/users/{id}/reject`): deletes the pending account and mails a short rejection. Only pending accounts can be rejected.
- **Features**, two switches per account, changeable at any time (`PATCH /admin/users/{id}/features`):

  | Switch | If on | If off |
  | :--- | :--- | :--- |
  | `server_results` | The account may choose the `all-server` storage mode (grading results on the server, client-side encrypted). | Only `hybrid` (results stay in the browser). |
  | `server_latex` | LaTeX may be compiled on the server. | The app compiles locally in the browser. |

  Exams and exercises always live on the server and have no switch. New and existing accounts default to everything on; accounts created before this feature kept everything. The switches are enforced: the interface offers only what the account's capabilities allow, and the server refuses the rest with `403 ERR_FEATURE_NOT_ALLOWED`. What happens to an account that loses `server_results` while its results are on the server is described in `docs/dev/storage_modes.md`: it moves them into its browser, and nothing is lost.

If no admin can sign in to approve, the operator can approve from the command line (`python -m app.cli approve-user --email user@school.com`); it leaves the account's features unchanged.

### 7.4 Always-allowed domains

An admin can list e-mail domains whose registrations are approved immediately (`/admin/allowed-domains`, also in the Admin UI), each with the features its accounts receive. The match is exact on the part after `@`, lowercased; a subdomain needs its own entry. Enter a plain hostname such as `school.example` (a leading `@` is stripped; wildcards and other input give `400 ERR_INVALID_DOMAIN`, a duplicate `409 ERR_DOMAIN_EXISTS`). Changing or removing an entry affects future registrations only, never existing accounts.

> **Never list a public mail provider** (gmail.com, outlook.com and the like). Everyone with an address there would be approved without review. The Admin UI warns about this; the check is the admin's own.

### 7.5 Retention

Registrations that nobody completes and accounts that nobody approves do not stay forever. The retention job (`python -m app.cli run-retention`) deletes expired rows from `registration_requests`, and deletes pending accounts older than `PENDING_ACCOUNT_RETENTION_DAYS`. Only a plain teacher account that holds no exam, no exercise and no key envelope qualifies, which a pending account cannot create. Each such erasure writes a `USER_REJECTED` audit row with the actor `system:retention-cron` and a hash of the account id, never the address.

### 7.6 Audit trail

`USER_REGISTERED`, `USER_APPROVED` (with the actor `system:allowed-domain` for an automatic approval), `USER_REJECTED`, `USER_FEATURES_CHANGED`, `ALLOWED_DOMAIN_ADDED`, `ALLOWED_DOMAIN_CHANGED` and `ALLOWED_DOMAIN_REMOVED`.

---

## Quick Reference Commands

| Action | Command |
| :--- | :--- |
| **Create User (CLI)** | `python -m app.cli create-user --email user@school.com --role teacher` |
| **Create Admin (CLI)** | `python -m app.cli create-user --email admin@school.com --role admin --allow-admin` |
| **Approve a pending account (CLI)** | `python -m app.cli approve-user --email user@school.com` (recovery path when no admin can sign in; normally approve in the Admin UI) |
| **Direct Password Reset** | `python -m app.cli set-password --email user@school.com` (does **not** restore the user's encrypted data) |
| **Send Reset Email** | `python -m app.cli send-password-reset --email user@school.com` |


