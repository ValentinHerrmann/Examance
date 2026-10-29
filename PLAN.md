# Examance: review findings and refactoring plan

This file is the handoff for implementing a codebase review (October 2026). It is self-contained: work through it top to bottom, tick boxes as you go, and keep it updated in the same PR. Delete it once everything is done.

Branch: `claude/codebase-analysis-refactor-h5ui3e`.

Rules (from `CLAUDE.md`):
- Push the work in this order of phases. A later phase may become its own PR once the previous one is merged.
- Run only basic verification: `make lint`, `npx svelte-check --threshold error`, and an import check. Do not run the unit test suites; a human tests.
- Security, crypto and retention changes must be called out in the PR body. Read `docs/data_flow_and_security.md` and `docs/breach_response_checklist.md` first.
- Delegate mechanical packages (dead code, router splits, modal migrations) to cheaper subagents.
- Results always follow the account's storage mode, and only `services/resultsMover.ts` may write to the other side.
- Comments stay at most 2–3 lines. Update `CLAUDE.md`, `docs/dev/` and the in-app help when behaviour changes.

## 0. Baseline (for measuring the outcome)
Non-blank lines over `git ls-files`, binaries excluded:

| Category | Lines | Files |
|---|---:|---:|
| Frontend Svelte (components and routes) | 31,187 | 230 |
| Frontend TS/JS (lib, workers, stores) | 23,960 | 189 |
| Backend Python (`backend/app`) | 14,546 | 118 |
| **Hand-written application code** | **≈69,700** | |
| Frontend i18n (de + en, incl. ~790 lines of in-app help) | 8,019 | 60 |
| Frontend tests / backend tests | 9,418 / 6,906 | 78 / 35 |
| Alembic migrations | 2,224 | 47 |
| LaTeX assets | 12,716 | 14 |
| Generated `docs/openapi.json` / `static/example-data/example.json` | 12,652 / 6,535 | 2 |
| Lockfiles | 8,261 | 2 |
| Dev and operator docs / legal / pitch / demo scripts | 1,990 / 331 / 1,191 / 1,465 | |

Target:
- Refactors and merges remove about 3,900 lines of hand-written code; the fixes add about 700 back.
- Phase 9 (one-line comments) removes about 3,500 more, about 3,300 of them in app code and tests.
- Net: about −6,700 lines (≈ −9.6 %).
- Separately, the generated `example.json` drops by 6.5k lines.

## Phase 1: backend security
- [x] **S1 LaTeX file read.**
  - Done: separate `latex` worker container (user decision) instead of bubblewrap, which needs user namespaces that Docker's default seccomp/AppArmor block for uid 10001. Runner in `services/tectonic.py`, worker `app/latex_worker.py`, compose service `latex`. The `\openin\f=` form still passes the regex; the container is the boundary. Not runnable here (no Docker, Tectonic bundle host blocked).
  - The `\input` tripwire in `backend/app/services/latex.py` (about lines 48–52, 157–167, 312–321) is bypassable via `\def\p{/etc/passwd}\input{\p}`, `\openin` or `\read`.
  - Tectonic runs as the backend user, so a teacher with `server_latex` can read any file that user can read.
  - Fix: sandbox the Tectonic subprocess with bubblewrap (or nsjail) inside the backend Docker image. Bind only the compile tmpdir (rw) and the Tectonic cache and `backend/latex-assets` (ro); no network; a separate uid if possible.
  - Keep the regex as a cheap first filter.
  - Probe: a document with `\newread\f\openin\f=/etc/hostname` must fail or read nothing.
- [x] **S15 Orphaned Tectonic.** The child is killed only on `TimeoutError` (`latex.py` ~334). Kill it in a `finally` so `CancelledError` (client disconnect) is covered too.
- [x] **S2 Second-factor brute force.**
  - `login_throttle.register_success` runs after the password factor (`routers/auth.py` ~473 and ~922) and clears the shared `login:fail:` counter.
  - With a known password, a loop of login plus 4 wrong TOTP codes never locks.
  - Fix: count second-factor failures under a separate key that only full session issuance clears. Password success clears only the password counter.
- [x] **S4 Argon2 blocks the event loop.** Wrap `hash_password` and `verify_password` calls in `await asyncio.to_thread(...)`. Call sites: `routers/auth.py`, `services/registration.py`, `crypto.py`.
  - Done: `hash_password_async`/`verify_password_async` in `services/crypto.py` (the module lives there, not `app/crypto.py`); also the legacy backup-code loop in `mfa.py`.
- [x] **S5 Unbounded memory store.** `services/ephemeral_store.py`'s in-process fallback only prunes the key it reads. Sweep expired entries on `set`, at most once per N seconds.
- [x] **S6 Non-atomic counters.** `login_throttle.register_failure`, the layout-report quota (`routers/layout_reports.py`) and the training quota all use get-then-set. Add an atomic `incr(key, ttl)` to `ephemeral_store`: Redis `INCR` plus `EXPIRE`, and a lock-protected in-memory version.
- [x] **S7 CORS.** `CORS_ALLOWED_ORIGIN_REGEX` in `config.py` allows every `*.valentin-herrmann.com` origin with credentials while cookies are `SameSite=None`. Replace it with an explicit origin list from env. The production and preview hosts are in `docs/deployment.md`.
  - Done: no regex default; preview keeps a loopback-only regex. Operator: remove the wildcard `CORS_ALLOWED_ORIGIN_REGEX` line from the preview host `.env`.
- [x] **S8 Envelope replacement.**
  - Done: refusing `enroll` whenever a set exists would break `addPasskeyWrap` during enrolment (e.g. after an admin factor reset). Instead `enroll` may add or renew passkey wraps but must keep the key id and the live password/recovery wraps byte-identical; it may delete only passkey wraps.
  - `routers/keys.py` `_ENVELOPE_WRITE_SCOPES` lets an `enroll`-scope session (one factor) call `key_envelope.replace_envelope_set` on an account that already has envelopes.
  - Fix: allow `enroll` only when no set exists, otherwise require a full session.
- [x] **S9 Passkey delete.**
  - Done: key-capable check (password wrap or passkey wrap) after the delete, rolled back on refusal; recovery is not counted, matching `may_remove_factor`.
  - `routers/webauthn.py` `delete_credential` runs `may_remove_factor` only for the last passkey.
  - Fix: always check that some remaining factor can still open the vault (password wrap, PRF passkey or recovery). Delete that credential's key envelope in the same transaction.
- [x] **Low items.**
  - Done: all except the admin audit `request_ip`, which moves into the Phase 4 audit sweep (`audit_svc.log`).
  - TOTP replay and backup-code double spend (`services/mfa.py` `verify_totp` and `consume_backup_code`): use an atomic conditional UPDATE.
  - `admin.reset_user_factors` (~487): refuse it for admins and pending accounts.
  - Admin audit writes: pass `request_ip` so `ip_hash` is set.
  - `forgot_password`: make known and unknown e-mail addresses do the same work.
  - Passkey login failure as the second factor: reissue the pending token like the password and TOTP routes do.

## Phase 2: frontend security (crypto: call out in PR)
- [ ] **S3 Pseudonym hash.**
  - Design note written: `docs/dev/pseudonym_hmac_and_aad.md` (HMAC over the old SHA-256 hex, so all-server rows can be re-keyed without raw values). **Waiting for sign-off.**
  - `pseudonym_hmac` is an unkeyed `SHA-256(raw)` from `ensure64CharHex` (`lib/repositories/studentRepository.ts` ~32, `submissionRepository.ts` ~39).
  - `lib/crypto/hmac.ts` `hmacPseudonymId` (keyed, per exam) is never called, which contradicts `docs/data_flow_and_security.md`.
  - External name-sticker QR codes (`lib/workers/qrWorker.ts` ~35, ~66) make the hash dictionary-attackable, and the raw value sits in plain Dexie columns (`students.pseudonymId`, `submissions.pseudonymHash`).
  - Fix:
    - derive a per-exam HMAC key via HKDF from the data key;
    - compute `pseudonym_hmac` with it;
    - store the raw value only inside the encrypted payload.
  - Migration:
    - on unlock, re-key existing rows with idempotent per-exam upserts (pattern: `services/resultsMover.ts`);
    - track progress in a Dexie meta flag;
    - the server needs a way to rename hmac keys per exam (new endpoint or upsert plus delete).
  - Design this first, as a short note in `docs/dev/`.
- [x] **S10 Key in sessionStorage.** `lib/stores/session.ts` (~135) stores the raw data key in sessionStorage. Now: zero-fill all key arrays in `lock()`. Later, only after user sign-off: a session-wrapped key, with the design note in `docs/dev/`.
  - Done: zero-fill in `lock()`/`reset()`; the store keeps its own copies so a caller vault is never wiped. Session-wrapped key not started (needs sign-off).
- [ ] **S11 AAD.**
  - Covered by the same design note; **waiting for sign-off**.
  - Only scores use AAD in `lib/db/dbEncryption.ts` (~133–197), and even they fall back to no-AAD.
  - Fix: add AAD `"<kind>:<id>"` to every codec (student, submission, exam, exercise, audit, scan, annotation, resource, OMR).
  - Decrypt tries AAD first, then the legacy no-AAD; re-seal with AAD on the next write.
- [x] **S12 Cross-account writes.**
  - Done: header checked in the shared `_decode_session()` (also the Phase 4 dependency merge); the client resets this tab without broadcasting.
  - The account-mismatch check runs only on capability loads (`lib/stores/capabilities.ts` ~77) and is skipped when `teacherId` is null.
  - Fix: `lib/api/client.ts` sends `X-Expected-Account: <teacherId>`, and a backend dependency answers `409 ERR_ACCOUNT_MISMATCH` on a mismatch. The client then locks.
- [x] **S13 ZIP bomb.** `lib/archive/zipImport.ts` (~122) calls `unzipSync` with no limits. Use fflate's `filter` to cap the entry count and the total `originalSize`.
- [x] **S14 Archive KDF.**
  - `archive/packer.ts` (~222) and `unpacker.ts` (~157) use `deriveKey`, which silently falls back to PBKDF2 (`crypto/keyDerivation.ts` ~407).
  - Fix: export only with `deriveArgon2Key` and fail if Argon2 cannot load. On import, try Argon2, then PBKDF2.
- [x] **Low items.**
  - Done: dead `deriveRawKeyMaterial` removed; `getArgon2` ignores a pre-existing global. **Not done (finding):** the pin has no accept path in the UI (`security.envelope.changedAccept` unused, `clearFingerprint` uncalled), so the password path already dead-ends after a key change on another device; pinning the recovery path too would remove the last way back. Needs a product decision (wire the accept button first).
  - `openWithRecoveryCode` and `openWithPasskey` (`services/keyEnvelopeService.ts` ~265, ~540) should call `assertPinnedOrPin`.
  - Delete the dead `deriveRawKeyMaterial`.
  - `getArgon2` must not trust a pre-existing `window.argon2`.

## Phase 3: functionality and data-loss fixes
- [x] **F1** `lib/gdpr/subjectAccess.ts` (~169) reads Dexie directly, so the Art. 15 export fails in all-server mode. Read through the student, submission and score repositories, and look up by HMAC.
- [x] **F2** `auditLog` is in `vaultTables()` (`db/db.ts` ~208), so `db/hygiene.ts` (~460) wipes it at every logout. Exclude it from the wipe; it is encrypted and per-owner.
- [x] **F3** `lib/gdpr/erasure.ts` (~46) reports "erased" even when the delete was only queued. Return and show a "pending" state.
- [x] **F4** `services/offlineQueue.ts`:
  - Done: Dexie table `offlineQueue` (v11), store mirror persisted by object identity, legacy localStorage queue migrated once.
  - move the queue from localStorage to a Dexie table (scan ciphertext exceeds the quota);
  - serialise replay with a Web Lock;
  - catch quota errors.
- [x] **F5** `routes/+layout.svelte` (~202): lock only on 401 or 403 from `refreshSession()`, not on network errors.
- [x] **F6** `db/hygiene.ts` (~448, ~512):
  - Done: `lockSession()` is the one sign-out (name kept; the layout's copy is gone).
  - lock first, then clear caches in try/finally;
  - re-arm the idle timer;
  - merge the layout's and hygiene's lock and redirect into one `signOutLocal()`.
- [x] **F8** Repositories turn errors into `[]`. Affected: `submissionRepository.ts` ~261 and ~283, `studentRepository.ts` ~57, `exerciseRepository.ts` ~74, `examRepository.ts` ~146. Throw instead, and let display callers catch, so exports and erasures never run on partial data.
- [x] **F9** `routes/exam/[id]/scan/+page.svelte` (~560–866):
  - wrap the ingest in try/finally so `isProcessing` resets;
  - generate the `UNMATCHED-` codes (~684, ~980) with `crypto.getRandomValues`, 8 characters.
- [x] **F10** `examRepository.delete` (~252): delete on the server first, then the local cascade.
- [x] **F11** `services/resultsMover.ts`: `deleteOldCopy('to-server')` (~264) clears exams that were skipped, and `verify` (~159) only compares counts with `>=`. Fix: delete per moved exam, and verify by ID sets.
- [x] **F12** `studentRepository.ts` (~172) falls back to `DELETE /students/{hmac}`, a route that does not exist. Require `examId`.
- [x] **F13** A duplicate `order_index` makes `ex_{idx}.tex` overwrite another exercise. Reject duplicates in the exam schema (`schemas/exam.py`) with 422.
  - Done: **skipped**: the server compile that wrote `ex_{idx}.tex` is gone (M6) and legacy archives import with `order_index` 1, so a 422 would reject real data; the app never produces duplicates.
- [x] **F14** `routers/exercises.py`:
  - `create_new_version` and `create_new_variant` (~506–573): lock the group row (`with_for_update`) and require `is_current`;
  - `delete_exercise` (~619): promote the previous version.
- [x] **F15 Retention (call out in PR).** In `services/retention.py`:
  - Done: also detaches legacy `exercises.exam_id` before the purge. **`restore-server-data` not changed:** a per-record delete and the bulk purge mark rows identically; it needs a `purged_at` marker (migration) or retiring the endpoint (the frontend no longer calls it). Decision needed.
  - hard-delete soft-deleted exams after the grace period;
  - bulk-purge expired `RefreshToken` and `PasswordResetToken` rows;
  - use a bulk delete in the audit loop.

  Also:
  - `students.erase_student_identity` must call `scan_storage` (or `forget_scans_of_exams`);
  - `user.py` `restore-server-data` (~176) must not revive records the teacher deleted one at a time.
- [x] **F16 Unhandled 500s.**
  - Done: the placeholder race is absorbed (links to the winner's identity) instead of answering 409, so the offline queue never drops it.
  - Catch `IntegrityError` on a concurrent submission insert (`submissions.py` ~121) and return 409.
  - Reject a duplicate `item.id` in `put_scores` with 422.
  - Send layout-report download filenames as RFC 5987 `filename*`.
- [x] **F17 Workspace edge cases.** (PROVIDE_KEYS part done in Phase 2: one key-record shape for storage and tabs.)
  - `lib/db/workspace.ts` `openWorkspace` (~325) should map only a real owner mismatch to `blocked/foreign-key`; other errors are retryable.
  - Serialise it against `refreshCapabilities`.
  - Remove the localStorage key in `legacyCachedMode()` (~95) after the transaction commits.
  - `session.ts` `PROVIDE_KEYS` (~209) must carry the legacy keys and `bg_key_id`.
- [x] **Plausible, verify first:** a teaching route may mount while the workspace state is `unchecked` (`+layout.svelte` ~124, ~443). `put_scores` may break for legacy exams linked via `Exercise.exam_id`.
  - Done: both confirmed and fixed: teaching routes now wait while an unlocked tab is `unchecked`; `put_scores` accepts legacy exams linked via `exercises.exam_id`.

## Phase 4: backend refactor and merges (no API change except M6)
- [x] **M6 Remove the server exam compile.** The frontend never calls it.
  - Done: done in Phase 1 together with S1 (less code to restructure).
  - Delete `POST /exams/{id}/compile` (`routers/exams.py` ~692–768).
  - Delete `compile_exam_latex`, `format_mc_group_latex` and `format_exercise_latex` from `services/latex.py`, and their tests.
  - Remove the "server mirror" mentions in `frontend/CLAUDE.md` (page breaks, name line, extra notes, resources).
- [x] **Auth helpers** in `routers/auth.py`:
  - `_issue_session()` (3 copies of access, refresh, `RefreshToken` and cookies);
  - `_reject_factor()` (3 failure sequences);
  - `client_ip(request)` (11 copies);
  - one dummy-hash constant;
  - `_decode_session()` shared by `get_current_teacher` and `get_pending_teacher` in `dependencies.py`.
- [x] **Audit.** Make `audit_svc.log(request, …)` take the request and use it everywhere instead of the ~20 hand-written `audit_svc.write(teacher_id=…, teacher_email=…)` calls.
- [x] **Response builders.** Replace `_to_exercise_response` and `_to_res` (exercises) and `_to_exam_response` with `Model.model_validate(obj, from_attributes=True)` plus overrides.
- [x] **Update loops.**
  - Replace the ~25 `if body.x is not None` blocks in `update_exam` with a loop over `body.model_dump(exclude_unset=True)`.
  - Turn `duplicate_exam` into a `_COPIED_FIELDS` tuple.
- [x] **Lookups.**
  - `submissions.py`: use the existing `get_submission_for_teacher` dependency (4 lookups) and one `_to_response()` (5 copies).
  - `exercises.py`: add `get_own_group` (3 copies) and one group-metadata cascade helper.
  - `students.py`: use the Teacher from `get_teaching_teacher` instead of re-querying.
  - `admin.py`: use `_load_user` in the reset endpoints.
- [x] **LaTeX accessors.** Drop the `isinstance(dict)` and `getattr` dual accessors in `services/latex.py` (they are gone with M6 if they live only there).
- [x] **Dead code.** Delete `schemas/auth.TokenClaims`, `crypto.generate_invite_token`, `crypto.hash_token` (a duplicate of `services/tokens.hash_token`) and `crypto.hmac_sha256`. Grep `backend/tests` first. Keep `GET /user/me/export` and the admin endpoints.
- [x] **B1 CLI.**
  - Add `_with_teacher(email, fn)` on `_in_session` in `cli.py` for `send-password-reset`, `approve-user`, `create-user`, `set-role` and `set-password` (lookup, not-found and the schema hint).
  - `set-role` uses `services/account_deletion.ensure_not_last_admin`.
  - Do not touch the `maintenance` group, because CI runs it from the previous image.
  - Move the maintenance group into `cli_maintenance.py` with the same command names.
- [x] **B2 Uploads.**
  - Add `services/blob_validation.check_upload(content, max_bytes, label)`, used by `services/logo.decode_logo`, the resource upload in `routers/exercises.py` (~955–1030), `services/latex_resources.validate_resource` and `routers/layout_reports.py`.
  - Keep the error codes, including `413 ERR_PAYLOAD_TOO_LARGE`.
  - `logos._logo_response` reuses `latex_resources.resource_response(..., no_store=True)` with identical hardening headers.
- [x] **B3 Sharing fields.**
  - Add one `EXERCISE_CONTENT_FIELDS` constant and projection.
  - Replace `exercise_contributions._payload`, `exercise_sharing._content_from` and the list in `next_version`.
  - Add a test asserting the constant matches the content columns of the `Exercise` model.
- [x] **B4 Drop `exams.is_public`** (`models/exam.py` ~35, never read). Add a new Alembic migration (forward only; never edit old migrations).
  - Done: `0045_drop_exam_is_public`. An older image still maps the column, so rolling back past this release needs `alembic downgrade 0044_exam_extra_notes` first.
- [x] **Splits** (move code, no logic change):
  - `routers/exercises.py` → `routers/exercises/{library,sharing,resources}.py`;
  - `routers/auth.py` → `{session,recovery,registration}.py`;
  - `routers/admin.py` → `{users,domains,maintenance}.py`;
  - the exam fetch and serialise helpers from `routers/exams.py` (~50–263) → `services/exam_queries.py`;
  - the GDPR export body of `routers/user.py` (~234–375) → `services/account_export.py` with an `_iso()` helper.
- [x] **Verify:** export OpenAPI before and after and diff the route set. Only M6 may disappear.

## Phase 5: feature merges (user-approved)
- [x] **M1 "New exam" becomes the exam editor.** It replaces `routes/exam/new/+page.svelte` (795 lines) and `lib/components/exam-creation/*`, which duplicate the library picking, MC staging, ordering, metadata form and a hand-written preamble. That preamble ignores page breaks, packages and the logo.
  - "New exam" (dashboard, navbar, empty states, `lib/utils/links.ts`) opens `exam/ExamMetadataEditor` in create mode.
  - Save calls `examRepository.create` with empty links and navigates to `/exam/[id]?library=open`, which opens `ExamLibraryModal`.
  - `ExamLibraryModal` gets a "New exercise" button that opens `ExerciseEditorModal`. It replaces `CustomExerciseForm`; the new exercise is linked to the exam on save.
  - `/exam/[id]` must work with 0 exercises (preview disabled with a hint).
  - Delete `routes/exam/new/`, `components/exam-creation/*` (including `ExamMetadataForm`, `ExerciseSelector`, `SelectedExercisesList`, which has a literal `(idx + 1)` bug, and `CustomExerciseForm`), the `examCreation` help topic and the orphaned i18n keys (de + en).
  - Update `e2e/helpers`, `frontend/CLAUDE.md` (the "new-exam page has its own preamble builder" note and the `SelectedExercisesList` mention) and the in-app help.
  - Trade-off accepted by the user: an abandoned draft is a real, empty exam.
  - Estimate: −1,200 lines.
- [x] **M7 Remove "Sync to server"** from `routes/exam/[id]/+page.svelte` (~349–458, `syncCurrentExamToServer`). It bypasses `resultsMover`, swallows errors, uses an all-zero salt and can resurrect deleted exams. This also fixes F7. About −110 lines.
- [x] **M2 One score-save path and one grid.**
  - Add `lib/grading/scoreService.ts` with `saveSubmissionScores(examId, submission, { values, carry })`. It owns:
    - the OMR carry-forward;
    - never deleting rows with `omrMeta` or `decryptFailed`;
    - the total recompute (`isFullyGraded`, round to 2 decimals);
    - `saveSubmissionEncrypted`;
    - the `all-server` `PATCH …/score`.
  - Callers: grade page `handleSaveScore`, `manual-grading/ExerciseFirstGrid`, `StudentFirstGrid` and `PasteImportModal`.
  - Add `createStudentWithSubmission()` for `RosterManager` and `PasteImportModal`.
  - Merge the two grids into `manual-grading/ScoreGrid.svelte` with `orientation: 'students' | 'exercises'`. It shares `buildSubmissionMap` with the seq guard, the raw-input buffer, keyboard navigation and the `ScoreInputCell`. Keep the live grade, prev/next, per-exercise averages and the graded count.
  - Respect the frontend CLAUDE.md gotchas (issue #85 derived-store rule; never clear an OMR row).
  - Estimate: −300 lines.
- [x] **M3 Storage modal only at first sign-in.**
  - `components/StoragePolicyModal.svelte` duplicates the storage and LaTeX radios from `settings/SettingsForm.svelte`. Keep it only for the must-choose state, rendering `SettingsForm part="storage"`.
  - The navbar pills link to `/settings#storage-policy`.
  - Move the backend-URL field into a `/settings` card.
  - Host `StorageModeSwitchWizard` only in `routes/+layout.svelte`.
  - Drop the duplicated `misc.storageModal.*` keys.
  - Estimate: −220 lines.
- [x] **M4 One export dialog.**
  - `components/export/ExportOptionsModal` gains "Re-importable, password-protected backup" (replaces the native `prompt()` in `exportArchiveInteractively`; password fields in the dialog) and "Without exercise code" (replaces the "Share results" menu entry).
  - The exam page's two buttons, the workspace menu and the library all open it.
  - Both formats and ZIP re-import stay.
  - Estimate: −60 lines.
- [x] **M5 One verify route.**
  - Done: the item keeps its parameters (`/verify?submissionId=…&exerciseId=…&queue=…`), matching `gradeHref`; `ExamSidebar` and the e2e helpers had no link to the old route.
  - `routes/exam/[id]/verify-item` becomes `/exam/[id]/verify?item=<id>`, sharing the data load and queue (`lib/grading/mcVerification.ts`).
  - The old route redirects.
  - Update `utils/links.ts`, `ExamSidebar` and the e2e helpers.
  - Estimate: −80 lines.

## Phase 6: frontend refactor and visual merges (user-approved)
- [x] **V1 Code dialogs.**
  - `BackupCodeList` and `RecoveryCodeDialog` merge into `SetupCodesDialog`, which already handles either half via `labels`/`i18nPrefix` props.
  - Keep the per-variant copy button, download contents and i18n keys.
  - Callers: the settings security cards and `routes/reset-password`.
  - Optional: a `FactorCard` shell for the Totp, Recovery and Password factor cards and `PasskeyManager`.
  - Estimate: −120 lines.
- [x] **V2 `useSecondFactor()`** (`lib/webauthn/secondFactor.svelte.ts`). It holds the passkey ceremony (`loginOptions` → `authenticate` → `verifyLogin` → `passkeyUnwrap`), TOTP and backup-code submit, and the error mapping. Shared by `routes/unlock` and `routes/reset-password`; each page keeps its own state machine. Auth: call out in the PR. Estimate: −100 lines.
  - Done: plain functions in `lib/services/secondFactor.ts` (no state to share); reset-password now reports a locked account and an expired step like sign-in does.
- [x] **V3 Dialog primitives.**
  - Done: no hand-rolled dialogs were left; the `role="dialog"` hits are `ConfirmDialog` calls whose role the e2e tests rely on.
  - `ui/ConfirmDialog` gains `error`, `confirmDisabled` and a cancel that is disabled while busy.
  - Delete `ConfirmDeleteModal`; `common/DeleteWithUsageModal` uses `ConfirmDialog`. Update `frontend/CLAUDE.md`, which names `ConfirmDeleteModal`.
  - `StatsExportModal` becomes a `ConfirmDialog` call.
  - `ClearAnnotationsModal` and `LastSubmissionModal` merge into `ui/HeroDialog` (icon badge, tone, title, body, two actions).
  - Move the remaining hand-rolled `role="dialog"` and `<dialog>` uses onto `ui/Modal`; find them with `git grep -ln 'role="dialog"\|<dialog' frontend/src`.
  - Estimate: −90 lines, more for the hand-rolled ones.
- [x] **V4 `admin/FeatureMatrix`.** A generic table with per-feature switches (`ACCOUNT_FEATURES`), with `identity`, `meta` and `actions` snippets. Used by `admin/AccountList` and `admin/AllowedDomains`. Keep the aria labels and the busy rules. Estimate: −60 lines.
- [x] **V5 Filters and analytics.**
  - Done: only the shared predicate (`matchesExerciseFilters`). Not done, because both grew the code: the inline `ListFilterPanel` layout for the picker (+30 lines) and `AnalyticsSection`/`ScoreBar` (+33).
  - `ExerciseLibraryPicker` uses `common/ListFilterPanel` with a new `layout="inline"` and `size` prop, keeping its own sort persistence and i18n keys.
  - Share the library filter predicate between `/exam/[id]` and `/exercises` via `utils/listFilter.ts`.
  - `ExerciseQualityTable` and `VariantFairnessTable` share `analytics/AnalyticsSection` and `ScoreBar`; the colour threshold is a prop.
  - Estimate: −125 lines.
- [x] **V6 Forms, logo and MC options.**
  - Done: the forms (`Field`, `SuggestField`). Not done, because both grew the code: `LogoFilePicker` (+16) and `McOptionRow` (+45; the two rows differ too much, and it would have turned a `<button>` into `div role="button"`).
  - `GroupEditModal`, `VariantModal` and `ExamMetadataEditor` use `ui/Field`, plus a new `SuggestField` (`Field` + `SuggestInput` with `storageKey`).
  - Add `LogoFilePicker`, shared by `AccountLogoCard` and `ExamLogoField`; the save semantics stay in the parents.
  - Add `McOptionRow`, shared by `McAnswerReview` and `McItemVerificationCard`.
  - Estimate: −115 lines.
- [x] **Page splits** (no shrink, readability):
  - Done: exam page 1,352 → 815 (`loadExam.ts`, `ExamMetadataEditDialog`, `ExamExercisePicker`; MC-group editing stays in the picker, it is a tab of the same modal), library page 1,432 → 966 (four `*Flow` components, `utils/dirtyClose.svelte.ts` also used by the exercise editor), scan page 1,119 → 771 (`lib/scan/ingest.ts` with 13 tests; the upload path never used native dialogs). Not done: the unlock state machine; it saves no lines and would move the sign-in rules, so only "clear `password` after use" was done.
  - `routes/exam/[id]/+page.svelte` (1,475): a `loadExam` service plus `MetadataEditor`, `LibraryPicker` and `McGroupEditor`.
  - `routes/exercises/+page.svelte` (1,434): diff, variant, regroup and group-metadata modals as components with one dirty-close helper.
  - `scan/+page.svelte` (1,058): `handleFileUpload` → `lib/scan/ingest.ts`, returning a result object instead of `alert`/`confirm`/`prompt`.
  - `routes/unlock/+page.svelte` (750): the state machine → `unlockFlow.svelte.ts`; clear `password` after use.
- [x] **Dead exports.** Grep including tests and dynamic imports, then delete: `generateLatex` (`lib/latex/generator.ts`), `generateQrDataUrl`, `calculateGrade`, `checkKAnonymity`, `unpackProject`, `deleteEnvelope`, `isPhone`/`isTablet`/`isTouch`/`viewportWidth` (also update `frontend/CLAUDE.md`), `getCompileCacheStats`, `invalidateSlot`, `openHelpOverview`, `redirectToHome`, `clearRecentValues`, `hasPlatformAuthenticator`, `storagePolicyLabelStore` and `storagePolicyBadgeStore`. Estimate: −200 lines.
  - Done: kept the test-only hooks `getCompileCacheStats`, `invalidateSlot` and `unpackProject` (they back meaningful tests).
- [x] **i18n.** Prune the dead keys in both locales after checking for dynamic lookups (`tOptional`, `errors.code.*`). Candidates: `common.yes`, `dashboard.importPasswordPrompt`, `auth.unlock.errors.passwordNotSet`.
  - Done: 58 keys per locale. Kept `security.envelope.changedTitle`/`changedAccept` (the key-copy accept path is an open decision). `help.topics.settings.s3.p2` (colour scheme) was real help text that was never shown; it is shown now.
- [x] **Shared LaTeX package rules.** `FORBIDDEN_PACKAGES`, `LOCKED_PACKAGES`, `PACKAGE_ALIASES`, `AFTER_HYPERREF`, `MAX_*` and `NAME_PATTERN` are duplicated in `frontend/src/lib/latex/packages.ts` and `backend/app/services/latex_packages.py`. Move them to one `backend/latex-assets/package-rules.json` read by both (frontend: Vite import). Update `docs/dev/latex_packages.md`.
  - Done: in `backend/app/services/latex_package_rules.json` (not `latex-assets/`, which is copied into every compile directory and the browser asset manifest).
- [ ] ~~**Optional:** a `useAsync` loading/error helper~~ Skipped (optional; a new helper for three call sites). for components that hand-roll it (`LayoutReports`, `AccountLogoCard`, `ExamLogoField`).

## Phase 7: generated data and CI
- [x] Minify `frontend/static/example-data/example.json` in `docs/demo-instance/export-example.mjs` (no indent) and regenerate it. −6.5k lines, same content.
- [x] Keep `docs/openapi.json` (docs and tests use it). Add a CI drift check to the existing backend workflow in `.github/workflows/`: run `cli.py export-openapi`, then `git diff --exit-code docs/openapi.json`.
- [x] Do not squash the Alembic migrations, because deployed instances may sit on old revisions.

## Phase 8: docs
- [x] `docs/data_flow_and_security.md`: keyed pseudonym HMAC, AAD, the LaTeX sandbox, the expected-account header.
  - Done except HMAC and AAD, which wait for the S3/S11 sign-off; also the second-factor throttle and key zeroing.
- [x] `docs/dev/storage_modes.md`: per-exam mover deletion and the Dexie-backed offline queue.
- [x] `backend/CLAUDE.md` and `frontend/CLAUDE.md`: new module paths (router packages, `scoreService`, `ScoreGrid`, `HeroDialog`, `FeatureMatrix`), and removals (`/exam/new`, `ConfirmDeleteModal`, the server exam compile).
- [x] In-app help (`lib/help/topics.ts`, `i18n/*/help.ts`): exam creation, export dialog, storage settings.

## Phase 9: one-line comments (run last, so it does not conflict with the refactors)
Rule (user decision): when a comment or docstring spans several lines and its information matters, write it as **one line** and let the editor soft-wrap it. Only comments change; code does not.

Measured baseline (multi-line comment blocks, lines saved if each becomes one line):

| Area | Blocks | Saved |
|---|---:|---:|
| Frontend (`.ts`, `.svelte`) | 786 | ≈1,840 |
| Backend (`backend/app`) | 421 | ≈1,020 |
| Tests (frontend and backend) | 180 | ≈470 |

- [x] **Lint first.** Backend ruff selects `E`, so `E501` (line-length 100) would fail on one-line comments.
  - Add `"E501"` to `[tool.ruff.lint] ignore` in `backend/pyproject.toml`, with a one-line reason.
  - Code lines keep the 100-character convention by hand; there is no formatter.
  - The frontend has no `max-len` and no prettier, so nothing to change there.
- [x] **Forms.**
  - TS/JS: `/** text */` (JSDoc hover keeps working) or `// text`.
  - Python: `"""Text."""`.
  - Svelte markup: `<!-- text -->`.
  - Consecutive `//` or `#` lines become one line.
- [x] **Keep multi-line** where the line breaks carry structure:
  - lists of items or cases, tables, ASCII diagrams, code or LaTeX examples;
  - `ruff`/`eslint`/`noqa`/`type: ignore`/`svelte-ignore` directives;
  - separate comments that annotate different statements.
- [x] **While joining,** drop comments that only restate the next line (≈150–300 lines; for example "Append immutable audit log entry", "Non-fatal if offline"). Keep every "why", invariant, "never" rule and issue reference.
  - Done: 20 lines, reviewed by hand from the 82 short comments without a reason; group headers, numbered steps and empty-`catch` markers stay.
- [x] **Exclude** `backend/alembic/versions/` (never edit a migration the preview stack ran), generated files and vendored code.
- [x] **Rollout.** Delegate it file by file to cheaper subagents with a script-assisted first pass (join consecutive comment lines, then a manual review for the keep rules).
  - Done by script plus verification instead of subagents: Python ASTs identical, the TypeScript printer output identical, Svelte markup identical without HTML comments, comment words identical. Backend −1,210, frontend −1,964 lines.
  - Verify with `make lint`, `npx svelte-check --threshold error`, and a whitespace-insensitive diff of the code with comments stripped, which must be empty.
- [x] **Docs.** Update the root `CLAUDE.md` comment rule from "at most 2-3 lines" to: "Comments and docstrings: one line each (the editor wraps); say why, not what; longer explanations go to `docs/dev/` or the nearest `CLAUDE.md`." Also update `backend/CLAUDE.md` for the `E501` change.

## Verification checklist (for the human tester; put it in each PR body)
- [ ] `make lint`, `npx svelte-check --threshold error` and `cd backend && python -c "import app.main"` are clean.
- [ ] Sign in with the password, then 5 wrong TOTP codes: the account locks, and logging in again with the password does not reset it (S2).
- [ ] A LaTeX `\openin` probe of `/etc/hostname` reads nothing (S1).
- [ ] An existing hybrid and all-server account unlocks, the pseudonyms are re-keyed, and the grading data is intact (S3, S11).
- [ ] Move hybrid → all-server with one skipped exam; that exam's local results survive (F11).
- [ ] An offline reload does not lock (F5). The Art. 15 export works in all-server mode (F1).
- [ ] "New exam" → metadata → editor with library; the preview matches the final PDF, including logo and page breaks (M1). `git grep -n "exam/new\|verify-item" frontend/src` finds only the redirect.
- [ ] Both grid orientations save, and OMR rows survive (M2). The first-sign-in mode choice works (M3). Every export option works (M4). `/verify-item` redirects (M5).
