# Examance REST API Reference

The **Examance REST API** (`/api/v1`) powers backend compilation, encrypted submission storage, exercise library management, user authentication, and system administration for the Examance privacy-first anonymous exam grading platform.

---

## 1. Overview & Architecture

### Base URL
All API v1 endpoints are served relative to the root URL path:
```http
/api/v1
```

### Content Types
- Request payloads accept `application/json` unless handling binary compile/download requests.
- Response bodies return `application/json`, except binary compilation endpoints (`/api/v1/compile/latex`) which return `application/pdf`.

### Standard HTTP Response Codes
| Status Code | Meaning | Description |
|---|---|---|
| `200 OK` | Success | Request succeeded and response contains payload. |
| `201 Created` | Resource Created | Resource successfully created or upserted. |
| `202 Accepted` | Accepted | Request accepted; the outcome is deliberately not revealed (e.g. `POST /api/v1/auth/register`). |
| `204 No Content` | Deleted / Modified | Action completed with no return payload. |
| `400 Bad Request` | Client Error | Invalid input structure, missing mandatory fields, or malformed JSON. |
| `401 Unauthorized` | Unauthenticated | Missing, invalid, or expired session cookies/credentials. |
| `403 Forbidden` | Access Denied | Authenticated user lacks required role/permissions (e.g., non-admin calling admin routes, or an admin calling a teaching route: `ERR_TEACHER_ROLE_REQUIRED`). |
| `404 Not Found` | Not Found | Requested entity does not exist or user has no access. |
| `409 Conflict` | Entity Conflict | Duplicate record (e.g., registering user with already existing email). |
| `413 Payload Too Large` | Limit Exceeded | Request body exceeds configured size limit. |
| `429 Too Many Requests` | Rate Limited | Rate limit exceeded for specific IP or route. |
| `500 Internal Server Error` | Server Error | Unhandled backend processing error. |

### Standard Error Response Format
```json
{
  "detail": "Descriptive error message"
}
```

---

## 2. Security & Session Management

### Cookie-Based Authentication
Examance uses secure, HttpOnly, SameSite-protected cookies for session management:
- **`access_token`**: Short-lived JWT (15-minute validity) used for API authorization.
- **`refresh_token`**: Long-lived JWT (7-day validity) used to obtain new access tokens.

Cookies are issued automatically upon successful login (`POST /api/v1/auth/login`) and cleared upon logout (`POST /api/v1/auth/logout`). Accounts are provisioned by an admin invitation, by the initial-admin bootstrap, by the CLI, or by self-registration (§4.1, "Registration & approval"), which is always available. A new self-registered account is **pending** until an admin approves it, and a pending account never receives a token: not a session, not an enrollment token, not a refresh token, not a reset link. See `account_creation_and_management.md`.

### Refresh Token Rotation & Reuse Detection
- Every refresh token contains a unique JWT ID (`jti`).
- Exchanging a refresh token via `POST /api/v1/auth/refresh` invalidates the old `jti` and issues a new refresh token.
- If a previously used `jti` is presented again (indicating token theft or replay), the entire token family for that session is immediately revoked and the user is logged out.
- A refresh for an account that is not approved is refused (`401`), like every other authenticated route.

### Initial Admin Bootstrap & Admin User Provisioning
- The backend automatically creates an initial `admin` user on startup if `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` are configured in `.env`.
- Admins invite user accounts via `POST /api/v1/admin/users` without specifying passwords. Accounts are created approved, with the chosen role and features, and with uninitialized password hashes (`password_hash = None`); a single-use set-password token is emailed automatically.
- The bootstrap admin and accounts created with `python -m app.cli create-user` are created approved. `teachers.approved_at` has no default on purpose: a code path that forgets to set it produces a pending account that cannot sign in, never an unvetted one that can.
- **Admins manage users and the server only** (issue #58). Every endpoint that reads or writes exams, exercises, results or their settings (the compile, exams, logos, exercises, contributions, students, submissions and scores routers, `POST /training/omr-samples`, and `/user/storage-mode`, `/user/purge-server-student-data`, `/user/restore-server-data`) requires a teacher account (`get_teaching_teacher`) and answers an admin with `403 ERR_TEACHER_ROLE_REQUIRED`. Admins keep `/admin/*` and their own account endpoints (auth, MFA, passkeys, key envelopes, capabilities, export, deletion). `python -m app.cli set-role` changes a role.

### Single-Use Password Reset Tokens
- Password reset links carry 32-byte URL-safe raw tokens.
- The server stores only SHA-256 hashes of reset tokens. Tokens expire after a configurable duration (default 24 hours) and are invalidated immediately upon use.
- Completing a password reset (`POST /api/v1/auth/reset-password`) sets the new password and revokes all active refresh tokens for the user account.

### CORS & Security Policies
- **CORS Allowed Origins**: Explicitly restricted to configured origins (e.g., `https://examance.pages.dev`, `http://localhost:5173`, and `*.valentin-herrmann.com` subdomains).
- **Security Headers**: Middleware enforces strict Content Security Policy (CSP), anti-clickjacking frame options, and rate limits via `slowapi`.

---

## 3. Privacy & Security Constraints

### Zero-Knowledge Client-Side Encryption
- Student identity data (PII) and scan submission images are encrypted **client-side** using **Argon2id + HKDF-SHA-256 + AES-256-GCM** prior to transmission.
- The server stores only base64-encoded ciphertexts (`pii_ciphertext_b64`, `scan_ciphertext_b64`), IVs, and salts.
- The server never possesses decryption keys and cannot read student names or raw submission scans.

### Pseudonymisation & HMAC
- Submissions and student records are linked via `pseudonym_hmac` (a deterministic SHA-256 HMAC derived client-side from student identification numbers and a per-exam secret).

### Log Redaction (`LaTeXRequest`)
- To prevent accidental logging of exam questions or PII in compilation requests, the `LaTeXRequest` model overrides `__repr__` to redact raw LaTeX source text:
  ```text
  LaTeXRequest(latex='<REDACTED len=...>')
  ```

### Aggregate Statistics
- The server computes no aggregate score statistics. Class statistics are computed in the teacher's browser from their own results. The former `GET /api/v1/admin/stats/{exam_id}` was removed (issue #58): it gave every admin the score statistics of any teacher's exam.

---

## 4. Endpoint Reference Matrix

### 4.1 Authentication Router (`/api/v1/auth`)

| Method | Endpoint | Summary | Auth Required | Description |
|---|---|---|---|---|
| `POST` | `/api/v1/auth/login` | User Login | No | First sign-in factor: email and password. An unknown address, a wrong password and an account whose password is not set yet all answer `401 ERR_INVALID_CREDENTIALS`. Does not return a session on its own; see "Sign-in factors" below. An account still waiting for admin approval answers `approval_pending` (no cookie), but only after the password was correct. |
| `POST` | `/api/v1/auth/forgot-password` | Request Reset Link | No | Generates single-use reset token and emails link to an approved user. Returns generic success message to prevent email enumeration; nothing is sent for an unknown address or a pending account. The mail goes out after the response, so the response time does not reveal whether the address has an account. |
| `POST` | `/api/v1/auth/reset-password` | Complete Reset | No | Validates token, sets new user password, marks token used, and revokes active refresh tokens. |
| `POST` | `/api/v1/auth/refresh` | Refresh Session | Yes (`refresh_token`) | Rotates refresh token and issues new access token cookie. |
| `POST` | `/api/v1/auth/logout` | Logout | Yes | Invalidates session and clears session cookies. |

#### Auth Request & Response Schemas
- **`LoginRequest`**: `{"email": "string", "password": "string"}`
- **`ForgotPasswordRequest`**: `{"email": "string"}`
- **`ResetPasswordRequest`**: `{"token": "string", "new_password": "string"}`

#### Registration & approval (`/api/v1/auth`)

Self-registration is always available; it needs working mail delivery (`SMTP_HOST`) for the verification link to arrive.

| Method | Endpoint | Summary | Auth Required | Description |
|---|---|---|---|---|
| `POST` | `/api/v1/auth/register` | Request Registration | No | Rate limit 20/hour per IP. Always answers `202` with the same generic message. Mails `{FRONTEND_URL}/verify-email?token=...` only when no account exists for the address, and not again within `REGISTRATION_RESEND_COOLDOWN_SECONDS` (a fresh link replaces the old one). The mail is sent after the response, so neither the body nor the timing reveals whether an account exists. Nothing is created in `teachers` yet. |
| `POST` | `/api/v1/auth/account-deletion/preview` | Preview Account Deletion | No | Body `{"token"}` (in the body, so no access log keeps it). Returns `{email, keep_exercises, expires_at}` for the confirmation page; deletes nothing. `400 ERR_INVALID_DELETION_TOKEN` for an unknown, used or expired token. Rate limit 20/hour per IP. |
| `POST` | `/api/v1/auth/account-deletion/confirm` | Confirm Account Deletion | No | Body `{"token"}`. Single use. Deletes the account and everything it owns (exams, credentials, key envelopes, logos, exercise groups); student identities and submissions are first soft-deleted on the standard grace period. Exercises go too, unless the request kept them: then library exercises stay with `teacher_id` NULL. `409 ERR_LAST_ADMIN` for the last admin, `400 ERR_INVALID_DELETION_TOKEN` otherwise. Audit rows stay, with `teacher_id` nulled. Cookies are not touched. Rate limit 20/hour per IP. |
| `POST` | `/api/v1/auth/register/complete` | Complete Registration | No | Rate limit 20/hour per IP. Claims the single-use token and creates the account with the chosen password. Does not issue a session. `400 ERR_INVALID_REGISTRATION_TOKEN` for an unknown, used or expired token. |

- **`RegisterRequest`**: `{"email": "string"}`
- **`RegisterCompleteRequest`**: `{"token": "string", "new_password": "string (12-256 characters)", "note": "string (optional, up to 500 characters)"}`
- **`RegisterCompleteResponse`**: `{"status": "approved" | "pending"}`. `approved`: the address's domain is on the admin's always-allowed list, the account is approved at once with that domain's features, and the note is discarded. `pending`: the note is stored on the account and approved admins get a notice mail (a count and a link, never the registrant's address or note; none if another pending account arrived within the last 15 minutes).
- Until the link is used, the address is held only in `registration_requests` (address, SHA-256 hash of the token, expiry, last-sent time). Expired rows are deleted by the retention job, as are pending accounts older than `PENDING_ACCOUNT_RETENTION_DAYS` (default 90) that hold no data.
- A pending account (`teachers.approved_at` is null) holds no token of any kind. Sign-in answers `status: "approval_pending"` with no cookie, only after a factor was proven; `get_current_teacher`, the pending-scope dependency and `POST /auth/refresh` refuse it, and reset tokens are refused for it.

---

### 4.2 Compile Router (`/api/v1/compile`)

| Method | Endpoint | Summary | Auth Required | Description |
|---|---|---|---|---|
| `POST` | `/api/v1/compile/latex` | Compile LaTeX | Yes | Compiles raw LaTeX code into PDF bytes using sandboxed Tectonic engine. |

#### Compile Request & Response
- **Request Body**:
  ```json
  {
    "latex": "\\documentclass{article}...",
    "resources": [{ "filename": "figure.png", "content_b64": "iVBORw0..." }],
    "resource_exercise_ids": ["uuid..."],
    "logo_exam_id": "uuid...",
    "account_logo": false
  }
  ```
- **`logo_exam_id`** / **`account_logo`** (optional): the exam header logo the server writes next
  to `main.tex` (`examance-logo.<pdf|png|jpg>`, printed by `Schulaufgabe.sty`). `logo_exam_id`
  prints that exam's logo (an exam the caller does not own falls back to the account logo);
  `account_logo: true` prints the account logo, for a draft the server does not know yet. Neither
  prints no logo.
- **`resource_exercise_ids`** (optional): exercises whose stored resource files the server
  should load from its own database, so a client in server/hybrid mode does not upload bytes
  the server already has. Only exercises the caller may read are honoured; unknown ids are
  ignored. Where a filename appears in both, the inline copy wins — it is the caller's
  current, possibly unsaved version.
- **`resources`** (optional): files the document references by name. They are written
  flat next to `main.tex` for this compilation only and discarded with the temp
  directory — nothing is persisted. Limits: ≤ 30 files, ≤ 5 MB each, ≤ 20 MB total;
  the route's body limit is 28 MB. Names are sanitised, must not collide with a
  bundled LaTeX asset, and `.svg` is rejected (convert to PDF — it stays vector).
- **Response**: Binary stream (`application/pdf`).
- **Errors**: `403 ERR_FEATURE_NOT_ALLOWED` (the account's `server_latex` switch is off; `POST /api/v1/exams/{id}/compile` answers the same), `422 ERR_COMPILE_FAILED` (TeX diagnostics), `422 ERR_RESOURCE_INVALID` (a resource
  name is not usable), `503 ERR_COMPILE_UNAVAILABLE` (the engine itself is missing or cannot
  run), `504 ERR_COMPILE_TIMEOUT`. Unhandled faults return `500 ERR_INTERNAL` **with** CORS
  headers, so a browser reports the status rather than a phantom CORS failure.

---

### 4.3 Exams Router (`/api/v1/exams`)

| Method | Endpoint | Summary | Auth Required | Description |
|---|---|---|---|---|
| `POST` | `/api/v1/exams` | Create Exam | Yes | Creates a new exam with title, template, retention date, and optional exercises. |
| `GET` | `/api/v1/exams` | List Exams | Yes | Lists all active (non-deleted) exams owned by the authenticated teacher. |
| `GET` | `/api/v1/exams/{exam_id}` | Get Exam Details | Yes | Retrieves full exam metadata and live-linked exercises. |
| `PATCH` | `/api/v1/exams/{exam_id}` | Update Exam | Yes | Updates exam details and exercise links. |
| `DELETE` | `/api/v1/exams/{exam_id}` | Soft-Delete Exam | Yes | Soft-deletes exam and marks it inaccessible. Its student identities and submissions are soft-deleted on the standard grace period (`RETENTION_GRACE_DAYS`) and then erased by the retention job. |
| `GET` | `/api/v1/exams/{exam_id}/exercises` | List Exam Exercises | Yes | Retrieves exercises linked to the specified exam in display order. |
| `POST` | `/api/v1/exams/{exam_id}/compile` | Compile Exam | Yes | Compiles the complete exam LaTeX document from its live-linked library exercises; returns `application/pdf`. Needs the account's `server_latex` feature (`403 ERR_FEATURE_NOT_ALLOWED` otherwise). |
| `GET` | `/api/v1/exams/{exam_id}/logo` | Exam Logo | Yes | The exam's logo setting (`mode`: `account`, `none`, `custom`) and what it resolves to (`source`: `default`, `account`, `exam`, `none`, plus type and size). |
| `GET` | `/api/v1/exams/{exam_id}/logo/file` | Exam Logo File | Yes | Bytes of the logo the exam prints; 404 when it prints none. |
| `PUT` | `/api/v1/exams/{exam_id}/logo` | Set Exam Logo | Yes | `{"mode": "account" \| "none" \| "custom", "content_b64"?}`. `custom` without content keeps the stored file. PNG, JPEG or PDF (detected from the bytes), ≤ 2 MB; `422 ERR_LOGO_INVALID` otherwise. |

#### Exam Query Parameters & Schemas
- **Query Filters** (`GET /api/v1/exams`): `grade` (string), `subject` (string).
- **`topic`** (optional, free text, ≤ 200 characters): organises exams in the overview; never printed on the exam. Trimmed on write; blank is stored as `null`. On `PATCH` an absent field keeps the stored topic, while `null` or blank clears it.
- **`ExamCreate`**:
  ```json
  {
    "title": "Algorithms Final",
    "latex_template": "\\documentclass{article}...",
    "retention_until": "2027-12-31",
    "klasse": "10a",
    "fach": "Informatik",
    "topic": "Sorting algorithms",
    "exercise_ids": ["uuid..."],
    "exercises": [
      {
        "order_index": 1,
        "max_points": 10.0,
        "question_type": "free_text",
        "penalty": 0.0
      }
    ]
  }
  ```

---

### 4.4 Exercises Router (`/api/v1/exercises`)

| Method | Endpoint | Summary | Auth Required | Description |
|---|---|---|---|---|
| `POST` | `/api/v1/exercises` | Create Exercise | Yes | Creates new exercise entry in library (version 1). |
| `GET` | `/api/v1/exercises` | List Exercises | Yes | Searches and lists exercise library with topic, grade, and subject filtering. |
| `GET` | `/api/v1/exercises/{id}` | Get Exercise | Yes | Retrieves a single exercise (own exercises or published ones). |
| `PATCH` | `/api/v1/exercises/{id}` | Update Exercise | Yes | Updates a library exercise in place. |
| `PATCH` | `/api/v1/exercises/groups/{group_id}` | Update Exercise Group | Yes | Updates group metadata and cascades it to every member variant. |
| `POST` | `/api/v1/exercises/{id}/new-version` | Create Version | Yes | Creates a new version of an exercise, updating `is_current`. |
| `POST` | `/api/v1/exercises/{id}/new-variant` | Create Variant | Yes | Creates a parallel variant within the same exercise group. |
| `GET` | `/api/v1/exercises/{id}/usage` | Exercise Usage | Yes | Lists exams referencing this exercise and count. |
| `DELETE` | `/api/v1/exercises/{id}` | Delete Exercise | Yes | Soft-deletes exercise from the caller's own library. Idempotent (always `204`); a foreign id is a silent no-op. |
| `GET` | `/api/v1/exercises/{id}/resources` | List Resources | Yes | Metadata of the exercise's resource files (no bytes). Readable for own and published exercises. |
| `POST` | `/api/v1/exercises/{id}/resources` | Upload Resource | Yes | Attaches a file (base64). Re-using a filename replaces that file. Body limit 7 MB; 5 MB per file, 25 MB per exercise. |
| `GET` | `/api/v1/exercises/{id}/resources/{resource_id}` | Download Resource | Yes | Raw bytes. Only `image/png`, `image/jpeg` and `application/pdf` are served under their own type; anything else is `application/octet-stream` as an attachment, always with `X-Content-Type-Options: nosniff`. |
| `PATCH` | `/api/v1/exercises/{id}/resources/{resource_id}` | Rename Resource | Yes | Renames the file. The LaTeX source referencing it must be updated separately. |
| `DELETE` | `/api/v1/exercises/{id}/resources/{resource_id}` | Delete Resource | Yes | Removes one resource file. Idempotent (`204`). |

#### Exercise Query Parameters
- **Query Filters** (`GET /api/v1/exercises`): `search` (string), `topic_tag` (string), `grade` (string), `subject` (string).

#### Exercise Resource Schemas
- **`ExerciseResourceCreate`**: `{"filename": "figure.png", "mime_type": "image/png", "content_b64": "iVBORw0..."}`
- **`ExerciseResourceResponse`**: `{"id": "uuid", "exercise_id": "uuid", "filename": "figure.png", "mime_type": "image/png", "byte_size": 20481, "created_at": "..."}`
- Resource bytes are stored in plaintext on the server (like `latex_body`) and copied
  onto new versions and variants of the exercise. `POST /api/v1/exams/{id}/compile`
  loads them from the database, so the client never uploads them for a server-side
  exam compile.

---

### 4.5 Students Router (`/api/v1/students`)

| Method | Endpoint | Summary | Auth Required | Description |
|---|---|---|---|---|
| `POST` | `/api/v1/exams/{exam_id}/students` | Upload Student PII | Yes | Stores/upserts client-side encrypted student PII record. An upsert onto a soft-deleted identity makes it live again (no erasure deadline). |
| `GET` | `/api/v1/exams/{exam_id}/students` | List Exam Students | Yes | Lists the exam's encrypted student records that are not soft-deleted. |
| `DELETE` | `/api/v1/exams/{exam_id}/students/{pseudonym_hmac}` | GDPR Erasure | Yes | GDPR Art. 17 right-to-erasure deletion of student record. Scoped to this exam only — see note below. |

> **Identity scope.** A student identity is keyed by `(pseudonym_hmac, exam_id)`, not by
> `pseudonym_hmac` alone. The same pupil appearing in two exams is two independent
> identities, so erasure removes the record for the named exam only. This also allows a
> workspace archive to be imported into a different account on the same server.
>
> **Known gap.** The per-exam derivation described above is not yet implemented on the
> client: `ensure64CharHex()` (`frontend/src/lib/crypto/hmac.ts`) currently computes an
> unkeyed SHA-256 of the raw pseudonym UUID, with no exam secret mixed in. The correct
> helper (`hmacPseudonymId()`) exists but has no call sites. Until that is wired up, the
> same pupil UUID produces the same `pseudonym_hmac` in every exam, so the server could in
> principle correlate a pupil across exams. Fixing it requires a re-keying strategy, since
> the server cannot re-derive the values itself.

#### Student Identity Payload
```json
{
  "pseudonym_hmac": "a1b2c3...64-hex-chars",
  "pii_ciphertext_b64": "base64...",
  "iv_b64": "base64...",
  "encryption_salt_b64": "base64...16 bytes"
}
```

> **`encryption_salt_b64` is a key-generation id, not a salt.** The name is
> historical, from when each record's key was derived per record. It is not: the
> ciphertext is sealed under `HKDF(dataKey, sessionNonce)`. The 16 bytes carry the
> `key_id` of the data-key generation that sealed the record, so a later key
> rotation is diagnosable rather than silently unreadable. Older clients sent 16
> zero bytes, and placeholder identity rows created by the submissions endpoint
> still do; treat that value as "no generation recorded".

#### Sign-in factors (`/api/v1/auth`, `/api/v1/mfa`)

A sign-in needs a passkey alone (`/webauthn/login/verify`, user verification
required) or two of three factors. Each step returns
`{status, satisfied, available}`: `factor_required` with the kinds still open,
`enroll_required` when the account has fewer than two factors, `approval_pending`
for a self-registered account no admin has approved yet (no cookie is set), or
`ok` with the session cookies set.

| Method | Endpoint | Summary |
|---|---|---|
| `POST` | `/auth/login` | First factor: email + password. Does **not** return a session on its own. |
| `POST` | `/auth/factor/password` | The password as the *second* factor. Takes no email — the account is the one the pending token names. Not reachable in the reset flow. |
| `POST` | `/auth/factor/totp` | Second factor: authenticator code. Second position only. |
| `POST` | `/auth/factor/backup-code` | Spends a backup code in place of the authenticator. |
| `POST` | `/auth/reset/start` | Opens a password reset with the emailed token. The response also carries `needs_key_recovery`: `false` for a fresh account (no key envelope, no exam, no exercise), whose reset page then skips the recovery-code step. |
| `POST` | `/auth/reset-password` | Sets the new password and, in the same transaction, the re-wrapped key. |
| `POST` | `/auth/change-password` | In-session password change. Full scope only, verifies the current password through the login throttle, and writes the re-wrapped key in the same transaction. Revokes every refresh token and re-issues this session's. |
| `GET` | `/mfa/status` | Enrolled factors, which of them are key-capable, backup codes left, whether a recovery code is on file, and when each factor was added and last used. |
| `POST` | `/mfa/totp/enroll` | Returns the `otpauth://` URI. The secret is shown once and never retrievable. |
| `POST` | `/mfa/totp/confirm` | First correct code confirms the factor; returns the backup codes once. |
| `POST` | `/mfa/backup-codes/regenerate` | Replaces the set; the previous codes stop working. |
| `DELETE` | `/mfa/totp` | Refused when it would drop the account below two factors, or below its last key-capable one. |
| `POST` | `/webauthn/register/options` · `/register/verify` | Add a passkey. Reachable from enrollment as well as a session. |
| `POST` | `/webauthn/login/options` · `/login/verify` | Passkey sign-in, in either position. Unauthenticated; takes no account identifier. When a sign-in is already part-way through, the passkey must belong to the account that token names. |
| `GET` | `/webauthn/credentials` | Registered passkeys, including whether each can open the encrypted data. |
| `DELETE` | `/webauthn/credentials/{id}` | Same last-factor guard as `DELETE /mfa/totp`. |

`available` is only ever populated after a factor has been proven — answering it
earlier would tell an unauthenticated caller which addresses have accounts here,
and which factors they use.

#### Key Envelopes (`/api/v1/keys`)

| Method | Endpoint | Summary |
|---|---|---|
| `GET` | `/keys/envelopes` | The calling teacher's wrapped data-key copies. |
| `PUT` | `/keys/envelopes` | Replace the whole set atomically. |
| `DELETE` | `/keys/envelopes/{id}` | Remove one wrap (used when a passkey is deregistered). |

Everything crossing this boundary is opaque to the server: ciphertext, a public
per-factor salt and public KDF parameters. Wrapping and unwrapping happen in the
browser.

Two rules the endpoint enforces rather than trusts the client with:

* **Replacement is wholesale.** A merge could leave the password wrap holding a
  new data key while the recovery wrap still held the previous one — a set that
  looks healthy right up until someone needs to recover with it.
* **A recovery wrap is mandatory and cannot be deleted.** It is the factor that
  always works; without it a forgotten password means unreadable data.

---

### 4.6 Submissions Router (`/api/v1/submissions`)

| Method | Endpoint | Summary | Auth Required | Description |
|---|---|---|---|---|
| `GET` | `/api/v1/exams/{exam_id}/submissions` | List Submissions | Yes | Lists all non-deleted submissions for an exam. |
| `POST` | `/api/v1/exams/{exam_id}/submissions` | Upload Submission | Yes | Stores/upserts encrypted scan submission and anonymized score. An upsert onto a soft-deleted submission makes it live again; a soft-deleted identity of the same pseudonym comes back only as an empty placeholder (its PII is not revived). |
| `GET` | `/api/v1/exams/{exam_id}/submissions/{submission_id}` | Get Submission | Yes | Retrieves single encrypted submission payload. |
| `PATCH` | `/api/v1/exams/{exam_id}/submissions/{submission_id}/score` | Update Score | Yes | Updates the plaintext `total_score` used for server-side statistics. |
| `DELETE` | `/api/v1/exams/{exam_id}/submissions/{submission_id}/grading` | Clear Grading | Yes | Clears all grading data (score + annotations) for a submission, without deleting it. |
| `DELETE` | `/api/v1/exams/{exam_id}/submissions/{submission_id}` | Delete Submission | Yes | Soft-deletes the submission; the retention job erases it (with its scores) after the grace period (`RETENTION_GRACE_DAYS`). |

> **Result writes follow the account's features.** `POST /exams/{id}/students`, `POST /exams/{id}/submissions`, `PATCH /exams/{id}/submissions/{id}/score`, `PUT /exams/{id}/submissions/{id}/scores` and `POST /user/restore-server-data` answer `403 ERR_FEATURE_NOT_ALLOWED` when the account's `server_results` switch is off **and** its stored storage mode is not `all-server`. An account whose switch was revoked while it is still in `all-server` keeps writing until it has moved its results into the browser, because refusing those writes would strand them in the offline queue. Reads and deletes are never gated: the move and GDPR erasure need them.

#### Submission Payload
```json
{
  "id": "optional-uuid",
  "pseudonym_hmac": "a1b2c3...64-hex-chars",
  "scan_ciphertext_b64": "base64...",
  "scan_iv_b64": "base64...",
  "total_score": 88.5
}
```

---

### 4.7 Admin Router (`/api/v1/admin`)

| Method | Endpoint | Summary | Auth Required | Description |
|---|---|---|---|---|
| `GET` | `/api/v1/admin/users` | List Accounts | Yes (Admin) | Accounts, newest first. Query: `status` (`all` default, `pending`, `active`), `limit` (1-200, default 100), `offset`. Returns `{"items": [AdminUserResponse], "total": n}`. |
| `POST` | `/api/v1/admin/users` | Invite User | Yes (Admin) | Invitation: creates an approved teacher or admin account with the given features and without a password (`password_hash = None`), and mails a set-password link with invitation wording. The address counts as verified, because that link is the only way in. Deletes any pending `registration_requests` row for the address. `409 ERR_ACCOUNT_PENDING` if a pending account exists for the address, `409 ERR_ACCOUNT_EXISTS` for any other existing account. |
| `POST` | `/api/v1/admin/users/{user_id}/approve` | Approve Registration | Yes (Admin) | Approves a pending account with the given features, erases the registrant's note and mails "approved, sign in". Conditional on the account still being pending: `409 ERR_ALREADY_APPROVED` otherwise. |
| `POST` | `/api/v1/admin/users/{user_id}/reject` | Reject Registration | Yes (Admin) | Deletes a pending account and mails a short rejection. `204`. Pending accounts only (`409 ERR_ALREADY_APPROVED` otherwise). |
| `PATCH` | `/api/v1/admin/users/{user_id}/features` | Change Features | Yes (Admin) | Partial update of the account's feature switches. Revoking `server_results` does not touch data; see `dev/storage_modes.md`. |
| `DELETE` | `/api/v1/admin/users/{user_id}` | Delete Account | Yes (Admin) | Deletes an approved account and everything it owns, like a confirmed self-deletion (`services/account_deletion.py`); the audit entry names the admin. Query `keep_exercises=true` keeps the library exercises on the server without an owner. `204`. `409 ERR_DELETE_SELF` for the admin's own account (use the self-deletion in the settings), `409 ERR_ACCOUNT_PENDING` for a pending one (reject it instead), `409 ERR_LAST_ADMIN` for the last admin. |
| `POST` | `/api/v1/admin/users/{user_id}/reset-password` | Force Password Reset | Yes (Admin) | Generates and emails a single-use password reset link for an existing user account. For an invited account that never set a password it resends the invitation. Refused with `409 ERR_ACCOUNT_PENDING` for a pending account. |
| `GET` | `/api/v1/admin/allowed-domains` | List Allowed Domains | Yes (Admin) | Domains whose registrations are approved automatically. |
| `POST` | `/api/v1/admin/allowed-domains` | Add Allowed Domain | Yes (Admin) | `{"domain", "features"}`. The domain is lowercased and a leading `@` removed; only plain hostnames (at least two labels, no wildcards) are accepted: `400 ERR_INVALID_DOMAIN`. `409 ERR_DOMAIN_EXISTS` for a duplicate. |
| `PATCH` | `/api/v1/admin/allowed-domains/{domain_id}` | Change Domain Features | Yes (Admin) | Same body as the account features update. |
| `DELETE` | `/api/v1/admin/allowed-domains/{domain_id}` | Remove Allowed Domain | Yes (Admin) | `204`. |
| `GET` | `/api/v1/admin/audit` | List Audit Logs | Yes (Admin) | Paginated audit log listing. |

#### Admin User Schemas
- **`AccountFeatures`**: `{"server_results": true, "server_latex": true}`. `server_results`: the `all-server` storage mode is allowed (`hybrid` always is). `server_latex`: server-side LaTeX compilation is allowed. Exams and exercises always live on the server and have no switch. Both default to `true`, so accounts that existed before the switches keep everything. `AccountFeaturesUpdate` has the same fields, each optional.
- **`AdminCreateUserRequest`**: `{"email": "teacher@school.com", "role": "teacher", "features": {"server_results": true, "server_latex": true}}`
- **`AdminCreateUserResponse`**: `{"id": "uuid...", "email": "teacher@school.com", "role": "teacher", "created_at": "...", "password_reset_sent": true}`
- **`AdminApproveRequest`**: `{"features": {"server_results": true, "server_latex": true}}`
- **`AdminUserResponse`**: `{"id": "uuid...", "email": "...", "role": "teacher", "created_at": "...", "approved_at": "... | null", "registration_note": "... | null", "features": {...}, "password_set": true}`. `approved_at: null` means pending; `registration_note` is set only while pending; `password_set: false` marks an invitation nobody has accepted.
- **`AllowedDomainRequest`**: `{"domain": "school.example", "features": {...}}`. **`AllowedDomainResponse`**: `{"id": "uuid...", "domain": "school.example", "features": {...}, "created_at": "..."}`. The match is exact on the part after `@`; a subdomain needs its own entry. Changes affect future registrations only, never existing accounts.
- **`AdminResetPasswordResponse`**: `{"message": "Password reset link generated...", "user_id": "uuid...", "password_reset_sent": true}`

---

### 4.8 User Router (`/api/v1/user`)

| Method | Endpoint | Summary | Auth Required | Description |
|---|---|---|---|---|
| `GET` | `/api/v1/user/capabilities` | Capabilities | Yes | `{"account_id", "storage_mode", "allowed_storage_modes", "features"}`: the account the answer is about (a tab locks itself when it differs from its own sign-in, because the cookie is shared by every tab of a browser), the account's storage mode (null until chosen), the modes it may choose, and its features: `server_results`, `server_latex` (admin switches) and `training_donation` (deployment setting). Built by `capabilities_for(teacher)`; the frontend renders its options from this and nothing else. An admin account gets no modes and no features. |
| `PUT` | `/api/v1/user/storage-mode` | Set Storage Mode | Yes | `{"mode", "expected"}`: compare-and-set, `409 ERR_STORAGE_MODE_CHANGED` if another browser changed it meanwhile, `403 ERR_STORAGE_MODE_NOT_ALLOWED` if the mode is not allowed for the account (`all-server` without `server_results`). Moving the results happens in the client before this call. |
| `POST` | `/api/v1/user/purge-server-student-data` | Purge Server Student Data | Yes | Soft-deletes this teacher's server-side student identities and submissions (7-day retention grace) — the local→`all-local` migration step in `data_flow_and_security.md` §5. |
| `POST` | `/api/v1/user/restore-server-data` | Restore Server Data | Yes | Restores soft-deleted student identities and submissions of the current teacher's non-deleted exams, if still within the 7-day grace period. Subject to the result-write rule in §4.6 (`403 ERR_FEATURE_NOT_ALLOWED`). |
| `GET` | `/api/v1/user/logo` | Account Logo | Yes | The account's logo setting (`mode`: `default` = bundled MTG logo, `none`, `custom`) and what it prints (`source`: `default`, `account`, `none`, plus type and size). |
| `GET` | `/api/v1/user/logo/file` | Account Logo File | Yes | Bytes of the logo the account prints (its own or the default), served as `image/png`, `image/jpeg` or `application/pdf` with `nosniff`; 404 for `none`. |
| `PUT` | `/api/v1/user/logo` | Set Account Logo | Yes | `{"mode": "default" \| "none" \| "custom", "content_b64"?}`. `custom` without content keeps the stored file. PNG, JPEG or PDF (detected from the bytes), ≤ 2 MB; `422 ERR_LOGO_INVALID` otherwise. Printed on every exam that does not override it. |
| `DELETE` | `/api/v1/user/logo` | Reset Account Logo | Yes | Back to the default (MTG) logo; same as `PUT {"mode": "default"}`. Returns the new setting. |
| `GET` | `/api/v1/user/me/export` | Export Own Data | Yes | GDPR Art. 15/20 export of what the server holds *about the teacher*: account fields (including `approved_at`, `registration_note`, `storage_mode` and `features`, with the account logo file), authored exams (with each exam's logo setting and own logo file), audit trail. Does **not** cover student data — see §4.5/§4.6 for that. |
| `POST` | `/api/v1/user/me/deletion-request` | Request Account Deletion | Yes | GDPR Art. 17, step one. Body `{"keep_exercises": bool}` (default false). Mails a single-use link to `/delete-account?token=…` (valid `ACCOUNT_DELETION_TOKEN_TTL_MINUTES`, default 60) and replaces an open request. Rate limit 5/hour per IP. `202 {"status": "sent", "expires_in_minutes"}`. `409 ERR_LAST_ADMIN` for the last admin account. Nothing is deleted yet. |

---

### 4.9 System / Meta Router

| Method | Endpoint | Summary | Auth Required | Description |
|---|---|---|---|---|
| `GET` | `/api/health` | Health Check | No | Returns `{"status": "ok", "version": "1.4.0"}`. The version is deliberately public — it is how the frontend detects an incompatible backend; see `deployment.md` §4. |
| `GET` | `/api/v1/privacy/retention` | Retention Periods | No | The configured retention periods the privacy statement (`/legal/datenschutz`) shows: `{"grace_days", "audit_log_days", "registration_link_hours", "pending_account_days", "contribution_days", "contribution_pending_days", "training_sample_days"}`, read from the settings of the same names. Configuration only, no personal data. Rate limit 60/minute per IP. |

---

## 5. Offline OpenAPI Specification Export

To export a static copy of the OpenAPI 3.0 specification JSON file for offline inspection or CI pipeline checks:

```bash
python -m app.cli export-openapi --output docs/openapi.json
```

Run this from the **repository root**, not from `backend/`: a relative `--output` is resolved against the repo root regardless of current working directory (`export_openapi()` in `app/cli.py` anchors it via `Path(__file__).resolve().parent.parent.parent`), so `docs/openapi.json` is correct from anywhere but `../docs/openapi.json` silently writes one directory above the repo.

The exported specification file is saved at [docs/openapi.json](docs/openapi.json).
