# Examance review: what is still open

The review plan of October 2026 is implemented on branch `claude/codebase-analysis-refactor-h5ui3e` (phases 1–9, see `git log`). This file keeps only what waits for a decision or a human test. Delete it once those are done.

## Waiting for sign-off (crypto: call out in the PR)

Design note for both: `docs/dev/pseudonym_hmac_and_aad.md`. Nothing is implemented yet.

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

- [ ] **S11 AAD.**
  - Covered by the same design note; **waiting for sign-off**.
  - Only scores use AAD in `lib/db/dbEncryption.ts` (~133–197), and even they fall back to no-AAD.
  - Fix: add AAD `"<kind>:<id>"` to every codec (student, submission, exam, exercise, audit, scan, annotation, resource, OMR).
  - Decrypt tries AAD first, then the legacy no-AAD; re-seal with AAD on the next write.

- [ ] **S10, second half: session-wrapped key.** `lock()` now zero-fills the key arrays; storing a session-wrapped key instead of the raw data key in `sessionStorage` needs its own design note and sign-off.

## Open decisions

- [ ] **Key-copy pin accept path.** `security.envelope.changedAccept`/`changedTitle` exist but no UI calls `clearFingerprint`, so after a key change on another device the password path dead-ends. Pinning the recovery and passkey paths too (`assertPinnedOrPin` in `openWithRecoveryCode`/`openWithPasskey`) would remove the last way back; wire the accept button first.
- [ ] **Preview host `.env`:** drop any wildcard `CORS_ALLOWED_ORIGIN_REGEX` (the code no longer has a default; keep only the loopback one for development).
- [ ] **`restore-server-data`** after the new hard delete of soft-deleted exams (F15): it needs a `purged_at` marker or should be retired.
- [ ] **Rollback past migration `0045_drop_exam_is_public`:** an older image still maps `exams.is_public`, so it needs `alembic downgrade 0044_exam_extra_notes` first.
- [ ] **LaTeX worker in compose** (S1) is untested here (no Docker): check the `latex` service, its network and the cache warm-up on the preview stack.
- Not done on purpose: F13 (would have done harm), the unlock-page state machine split (no lines saved, moves the sign-in rules; only "clear the password after use" was done), the inline `ListFilterPanel` layout, `AnalyticsSection`/`ScoreBar`, `LogoFilePicker`, `McOptionRow` and `useAsync` (each grew the code).

## Verification checklist (for the human tester; put it in each PR body)
- [ ] `make lint`, `npx svelte-check --threshold error` and `cd backend && python -c "import app.main"` are clean.
- [ ] Sign in with the password, then 5 wrong TOTP codes: the account locks, and logging in again with the password does not reset it (S2).
- [ ] A LaTeX `\openin` probe through an indirect path (`\def\target{/etc/hostname}\openin\probe=\target`) prints the `latex` container's hostname, not the backend's, and `/proc/1/environ` shows no secrets (S1, preview stack with the worker).
- [ ] An existing hybrid and all-server account unlocks, the pseudonyms are re-keyed, and the grading data is intact (S3, S11).
- [ ] Move hybrid → all-server with one skipped exam; that exam's local results survive (F11).
- [ ] An offline reload does not lock (F5). The Art. 15 export works in all-server mode (F1).
- [ ] "New exam" → metadata → editor with library; the preview matches the final PDF, including logo and page breaks (M1). `git grep -n "exam/new\|verify-item" frontend/src` finds only the redirect.
- [ ] Both grid orientations save, and OMR rows survive (M2). The first-sign-in mode choice works (M3). Every export option works (M4). `/verify-item` redirects (M5).
