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

## 3. Self-Service Password Reset

Users can request a password reset at any time:
1. Navigate to `/forgot-password` on the frontend (or click **Forgot Password?** on the login page).
2. Enter the registered email address.
3. If an account exists, a single-use reset link (`/reset-password?token=...`) is delivered via email (expires in 24 hours).
4. Enter a new password (min. 12 characters).
5. Sign in with it. Because the new password cannot open the stored copy of the
   data key, the app asks for the **recovery code** once, unwraps the key with it,
   re-wraps that same key under the new password, and issues a replacement
   recovery code. Nothing is re-encrypted and no data is lost.

> **Keep the recovery code.** It is shown exactly once, when the key is first
> stored (on the first sign-in after this feature ships) and again after every
> reset. It is the only factor that always works. Without it *and* without the
> old password, the account's existing exams, student data and grading stay
> permanently unreadable — nobody, including an administrator, can recover them,
> because the server never holds the data key.
>
> Data created after a reset is unaffected either way.

---

## 4. Admin-Forced Password Reset

Admins can trigger a password reset for any existing user via the Admin UI or CLI:
- **Admin UI**: Click **Reset Password** next to the user in **User Management**.
- **CLI**: `python -m app.cli send-password-reset --email user@school.com`

**Behavior:** The user's existing password remains operational until they complete setting a new password via the emailed reset link. Once reset, all active sessions and refresh tokens are revoked, forcing re-authentication across all devices.

**An admin cannot restore a user's data.** Setting a password server-side — through
the Admin UI, `send-password-reset`, or `set-password` — marks the password copy of
that user's data key unusable, because the server has no way to re-wrap a key it
has never seen. The user regains access by entering their recovery code on the next
sign-in. This is a property of the encryption model, not a missing feature: an admin
who could recover the data could also read it.

---

## 5. Troubleshooting: Initial Admin Bootstrap

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

## 6. Architectural Roadmap: Self-Registration with Admin Approval

The user management subsystem is designed to support self-registration in future releases:
- Unapproved self-registered accounts will remain in a pending state with `password_hash = None`.
- Admins will receive notifications and can approve or reject registration requests from the Admin UI.

---

## Quick Reference Commands

| Action | Command |
| :--- | :--- |
| **Create User (CLI)** | `python -m app.cli create-user --email user@school.com --role teacher` |
| **Create Admin (CLI)** | `python -m app.cli create-user --email admin@school.com --role admin --allow-admin` |
| **Direct Password Reset** | `python -m app.cli set-password --email user@school.com` |
| **Send Reset Email** | `python -m app.cli send-password-reset --email user@school.com` |


