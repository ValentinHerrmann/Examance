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
| `204 No Content` | Deleted / Modified | Action completed with no return payload. |
| `400 Bad Request` | Client Error | Invalid input structure, missing mandatory fields, or malformed JSON. |
| `401 Unauthorized` | Unauthenticated | Missing, invalid, or expired session cookies/credentials. |
| `403 Forbidden` | Access Denied | Authenticated user lacks required role/permissions (e.g., non-admin calling admin routes). |
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

Cookies are issued automatically upon successful login (`POST /api/v1/auth/login`) and cleared upon logout (`POST /api/v1/auth/logout`). There is no public self-registration endpoint — accounts are provisioned by an admin or by the initial-admin bootstrap; see `account_creation_and_management.md`.

### Refresh Token Rotation & Reuse Detection
- Every refresh token contains a unique JWT ID (`jti`).
- Exchanging a refresh token via `POST /api/v1/auth/refresh` invalidates the old `jti` and issues a new refresh token.
- If a previously used `jti` is presented again (indicating token theft or replay), the entire token family for that session is immediately revoked and the user is logged out.

### Initial Admin Bootstrap & Admin User Provisioning
- The backend automatically creates an initial `admin` user on startup if `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` are configured in `.env`.
- Admins create user accounts via `POST /api/v1/admin/users` without specifying passwords. Accounts are created with uninitialized password hashes (`password_hash = None`), and single-use password reset tokens are emailed automatically.

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

### $k$-Anonymity Enforcement ($k \ge 5$)
- Class statistics endpoints (`GET /api/v1/admin/stats/{exam_id}`) enforce a strict $k$-anonymity threshold ($k \ge 5$).
- If an exam has fewer than 5 submissions, grade aggregates (mean, min, max score) are suppressed (`k_anonymity_satisfied: false`, `mean_score: null`) to prevent individual score identification.

---

## 4. Endpoint Reference Matrix

### 4.1 Authentication Router (`/api/v1/auth`)

| Method | Endpoint | Summary | Auth Required | Description |
|---|---|---|---|---|
| `POST` | `/api/v1/auth/login` | User Login | No | Authenticates email and password. Returns `401 ERR_PASSWORD_NOT_SET` if account password is uninitialized. Sets `access_token` and `refresh_token` cookies. |
| `POST` | `/api/v1/auth/forgot-password` | Request Reset Link | No | Generates single-use reset token and emails link to user. Returns generic success message to prevent email enumeration. |
| `POST` | `/api/v1/auth/reset-password` | Complete Reset | No | Validates token, sets new user password, marks token used, and revokes active refresh tokens. |
| `POST` | `/api/v1/auth/refresh` | Refresh Session | Yes (`refresh_token`) | Rotates refresh token and issues new access token cookie. |
| `POST` | `/api/v1/auth/logout` | Logout | Yes | Invalidates session and clears session cookies. |

#### Auth Request & Response Schemas
- **`LoginRequest`**: `{"email": "string", "password": "string"}`
- **`ForgotPasswordRequest`**: `{"email": "string"}`
- **`ResetPasswordRequest`**: `{"token": "string", "new_password": "string"}`

---

### 4.2 Compile Router (`/api/v1/compile`)

| Method | Endpoint | Summary | Auth Required | Description |
|---|---|---|---|---|
| `POST` | `/api/v1/compile/latex` | Compile LaTeX | Yes | Compiles raw LaTeX code into PDF bytes using sandboxed Tectonic engine. |

#### Compile Request & Response
- **Request Body**: `{"latex": "\\documentclass{article}..."}`
- **Response**: Binary stream (`application/pdf`).

---

### 4.3 Exams Router (`/api/v1/exams`)

| Method | Endpoint | Summary | Auth Required | Description |
|---|---|---|---|---|
| `POST` | `/api/v1/exams` | Create Exam | Yes | Creates a new exam with title, template, retention date, and optional exercises. |
| `GET` | `/api/v1/exams` | List Exams | Yes | Lists all active (non-deleted) exams owned by the authenticated teacher. |
| `GET` | `/api/v1/exams/{exam_id}` | Get Exam Details | Yes | Retrieves full exam metadata and live-linked exercises. |
| `PATCH` | `/api/v1/exams/{exam_id}` | Update Exam | Yes | Updates exam details and exercise links. |
| `DELETE` | `/api/v1/exams/{exam_id}` | Soft-Delete Exam | Yes | Soft-deletes exam and marks it inaccessible. |
| `GET` | `/api/v1/exams/{exam_id}/exercises` | List Exam Exercises | Yes | Retrieves exercises linked to the specified exam in display order. |
| `POST` | `/api/v1/exams/{exam_id}/compile` | Compile Exam | Yes | Compiles the complete exam LaTeX document from its live-linked library exercises; returns `application/pdf`. |

#### Exam Query Parameters & Schemas
- **Query Filters** (`GET /api/v1/exams`): `grade` (string), `subject` (string).
- **`ExamCreate`**:
  ```json
  {
    "title": "Algorithms Final",
    "latex_template": "\\documentclass{article}...",
    "retention_until": "2027-12-31",
    "klasse": "10a",
    "fach": "Informatik",
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

#### Exercise Query Parameters
- **Query Filters** (`GET /api/v1/exercises`): `search` (string), `topic_tag` (string), `grade` (string), `subject` (string).

---

### 4.5 Students Router (`/api/v1/students`)

| Method | Endpoint | Summary | Auth Required | Description |
|---|---|---|---|---|
| `POST` | `/api/v1/exams/{exam_id}/students` | Upload Student PII | Yes | Stores/upserts client-side encrypted student PII record. |
| `GET` | `/api/v1/exams/{exam_id}/students` | List Exam Students | Yes | Lists encrypted student records associated with exam. |
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
  "encryption_salt_b64": "base64..."
}
```

---

### 4.6 Submissions Router (`/api/v1/submissions`)

| Method | Endpoint | Summary | Auth Required | Description |
|---|---|---|---|---|
| `GET` | `/api/v1/exams/{exam_id}/submissions` | List Submissions | Yes | Lists all non-deleted submissions for an exam. |
| `POST` | `/api/v1/exams/{exam_id}/submissions` | Upload Submission | Yes | Stores/upserts encrypted scan submission and anonymized score. |
| `GET` | `/api/v1/exams/{exam_id}/submissions/{submission_id}` | Get Submission | Yes | Retrieves single encrypted submission payload. |
| `PATCH` | `/api/v1/exams/{exam_id}/submissions/{submission_id}/score` | Update Score | Yes | Updates the plaintext `total_score` used for server-side statistics. |
| `DELETE` | `/api/v1/exams/{exam_id}/submissions/{submission_id}/grading` | Clear Grading | Yes | Clears all grading data (score + annotations) for a submission, without deleting it. |
| `DELETE` | `/api/v1/exams/{exam_id}/submissions/{submission_id}` | Delete Submission | Yes | Deletes specified submission scan. |

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
| `GET` | `/api/v1/admin/stats/{exam_id}` | Class Statistics | Yes (Admin) | Evaluates $k$-anonymity ($k \ge 5$) and returns aggregate exam stats. |
| `POST` | `/api/v1/admin/users` | Create User | Yes (Admin) | Provisions a new teacher or admin account without a password (`password_hash = None`) and sends a reset token via email. |
| `POST` | `/api/v1/admin/users/{user_id}/reset-password` | Force Password Reset | Yes (Admin) | Generates and emails a single-use password reset link for an existing user account. |
| `GET` | `/api/v1/admin/audit` | List Audit Logs | Yes (Admin) | Paginated audit log listing. |

#### Admin User Creation Schemas
- **`AdminCreateUserRequest`**: `{"email": "teacher@school.com", "role": "teacher"}`
- **`AdminCreateUserResponse`**: `{"id": "uuid...", "email": "teacher@school.com", "role": "teacher", "created_at": "...", "password_reset_sent": true}`
- **`AdminResetPasswordResponse`**: `{"message": "Password reset link generated...", "user_id": "uuid...", "password_reset_sent": true}`

#### Admin Stats Response Example
```json
{
  "exam_id": "uuid...",
  "total_submissions": 8,
  "k_anonymity_satisfied": true,
  "mean_score": 82.4,
  "min_score": 54.0,
  "max_score": 98.5
}
```

---

### 4.8 User Router (`/api/v1/user`)

| Method | Endpoint | Summary | Auth Required | Description |
|---|---|---|---|---|
| `POST` | `/api/v1/user/purge-server-student-data` | Purge Server Student Data | Yes | Soft-deletes this teacher's server-side student identities and submissions (7-day retention grace) — the local→`all-local` migration step in `data_flow_and_security.md` §5. |
| `POST` | `/api/v1/user/restore-server-data` | Restore Server Data | Yes | Restores soft-deleted student identities and submissions for the current teacher, if still within the 7-day grace period. |
| `GET` | `/api/v1/user/me/export` | Export Own Data | Yes | GDPR Art. 15/20 export of what the server holds *about the teacher*: account fields, authored exams, audit trail. Does **not** cover student data — see §4.5/§4.6 for that. |
| `DELETE` | `/api/v1/user/me` | Delete Account | Yes | GDPR Art. 17 — soft-deletes the teacher's account and authored content (exams, student identities, submissions) on the standard grace period, then schedules irreversible erasure. |

---

### 4.9 System / Meta Router

| Method | Endpoint | Summary | Auth Required | Description |
|---|---|---|---|---|
| `GET` | `/api/health` | Health Check | No | Returns `{"status": "ok", "version": "1.4.0"}`. The version is deliberately public — it is how the frontend detects an incompatible backend; see `deployment.md` §4. |

---

## 5. Offline OpenAPI Specification Export

To export a static copy of the OpenAPI 3.0 specification JSON file for offline inspection or CI pipeline checks:

```bash
python -m app.cli export-openapi --output docs/openapi.json
```

Run this from the **repository root**, not from `backend/`: a relative `--output` is resolved against the repo root regardless of current working directory (`export_openapi()` in `app/cli.py` anchors it via `Path(__file__).resolve().parent.parent.parent`), so `docs/openapi.json` is correct from anywhere but `../docs/openapi.json` silently writes one directory above the repo.

The exported specification file is saved at [docs/openapi.json](docs/openapi.json).
