# User & Account Management

Guide for creating and managing teacher and administrator accounts in **Examance**.

---

## 1. Initial Admin Bootstrap (Automatic Startup)

The system automatically creates an initial admin account on application startup if configured in `.env`:

```env
INITIAL_ADMIN_EMAIL=admin@school.com
INITIAL_ADMIN_PASSWORD=SuperSecureAdminPassword123!
```

When the backend starts, it checks if an account with `INITIAL_ADMIN_EMAIL` exists. If not, it creates an `admin` account with the specified password.

Alternatively, an admin account can be created manually via the CLI:
```bash
python -m app.cli create-user --email admin@school.com --role admin --allow-admin
```

---

## 2. Admin-Driven Account Creation (No Initial Password)

Admins create user accounts directly in the Admin UI or via the API (`POST /api/v1/admin/users`).

1. Open the Admin UI and click **User Management**.
2. Enter the **Email** and select the **Role** (`Teacher` or `Admin`).
3. Click **Create User**.

The backend creates the user account with an uninitialized password (`password_hash = None`) and automatically dispatches a single-use password reset link via email. The user opens the link to set their password prior to logging in.

---

## 2b. Sign-in factors

Every sign-in presents **two of three** factors: password, authenticator app
(TOTP), passkey. An account with fewer than two is held on the enrollment screen
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
3. If an account exists, a single-use reset link (`/reset-password?token=...`) is delivered via email (expires in 24 hours).
4. Enter a new password (min. 12 characters).
5. Confirm with a second factor — an authenticator code or a backup code. An
   emailed link on its own no longer resets a password: anyone who could read the
   mailbox could otherwise take the account. (An account that has not finished
   enrolling has no second factor to offer, so the link carries the reset alone.)
6. Enter the **recovery code**. The data key is unwrapped in the browser and
   re-wrapped under the new password; nothing is re-encrypted and no data is
   lost. A fresh recovery code is issued and shown once.
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

## 7. Architectural Roadmap: Self-Registration with Admin Approval

The user management subsystem is designed to support self-registration in future releases:
- Unapproved self-registered accounts will remain in a pending state with `password_hash = None`.
- Admins will receive notifications and can approve or reject registration requests from the Admin UI.

---

## Quick Reference Commands

| Action | Command |
| :--- | :--- |
| **Create User (CLI)** | `python -m app.cli create-user --email user@school.com --role teacher` |
| **Create Admin (CLI)** | `python -m app.cli create-user --email admin@school.com --role admin --allow-admin` |
| **Direct Password Reset** | `python -m app.cli set-password --email user@school.com` (does **not** restore the user's encrypted data) |
| **Send Reset Email** | `python -m app.cli send-password-reset --email user@school.com` |


