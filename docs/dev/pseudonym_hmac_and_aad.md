# Keyed pseudonym HMAC (S3) and AAD on every codec (S11): design for sign-off

Status: **proposal, not implemented.** Both change how existing grading data is sealed and addressed, including hybrid results that exist only in one browser, so they ship together, behind one migration, after sign-off.

## Problem

- `pseudonym_hmac` is `ensure64CharHex(raw)` = unkeyed `SHA-256(raw)` (`lib/crypto/hmac.ts`); 64-character inputs pass through unchanged. `docs/data_flow_and_security.md` promises a keyed, per-exam HMAC (`hmacPseudonymId`), which is never called.
- Raw values are guessable: QR stickers carry names or school ids (`lib/workers/qrWorker.ts` takes any payload as `pseudonymId`). Whoever holds the server database can hash candidate names and link submissions to students.
- Hybrid Dexie keeps raw values in plaintext index columns: `students.pseudonymId` (primary key) and `submissions.pseudonymHash` (`RosterManager`/`PasteImportModal` store the raw id there).
- AAD binds only scores (`lib/db/dbEncryption.ts`, `score:v1:<submission>:<exercise>`); every other codec can have its ciphertext swapped between rows by whoever writes the store (server in all-server mode, any script with IndexedDB access in hybrid).

## Key derivation and the new HMAC

- Per-exam key: `K_exam = HKDF-SHA-256(DEK, salt = UTF8("examance-pseudonym-v1"), info = UTF8(examId), 32 bytes)`, imported as a non-extractable HMAC key, cached per `(keyId, examId)` for the session and dropped on `lock()`.
- `pseudonym_hmac_v2 = HMAC-SHA-256(K_exam, sha256hex(raw))`, i.e. keyed over **the old value**. That is the decisive choice: in all-server mode the client only ever saw the old SHA-256 (the server stores nothing else), so a keyed HMAC over the raw value could not be computed for existing rows. Keying the old hash re-keys every row without the raw value and keeps the cost of a guess at "know `K_exam`" (which the server never holds).
- One helper replaces every `ensure64CharHex` call site (about 20: repositories, `studentLookup.ts`, `mcVerification.ts`, `GradingHeader.svelte`, `gdpr/erasure.ts`, the scan and exam pages): `pseudonymKey(examId, value, key): Promise<string>`. `value` may be raw or an old hash; it hashes raw values first (any non-64-hex input), so callers never branch. The 64-hex pass-through stays only for that first step, as today.
- Version marker: the server column keeps 64 hex characters; the version lives per exam (`exams.pseudonym_version`, 1 = SHA-256, 2 = keyed), so lookups on a not-yet-migrated exam keep working.

## Storage changes

- Server: new column `exams.pseudonym_version SMALLINT NOT NULL DEFAULT 1` (forward migration). New endpoint `POST /exams/{id}/pseudonyms/rekey` with `{from_version: 1, to_version: 2, pairs: [{old, new}]}`: in one transaction it renames `student_identities.pseudonym_hmac` and `scan_submissions.pseudonym_hmac` per pair and sets the version, compare-and-set on `from_version` (409 when another browser already did it), 422 on a duplicate or unknown `old`. Idempotent: a repeat with the version already at 2 answers 200 with nothing to do. Gated like other result writes (`require_server_results_writable` unless the account is still `all-server`).
- Dexie v11: `students` keyed by `[examId+pseudonymHmac]`, `submissions` index `pseudonymHmac`; the raw id (for display and QR matching) moves into the encrypted student payload. The upgrade function cannot compute HMACs (no key during `db.open()`), so it copies rows into the new tables marked `pseudonymVersion: 1` and the post-unlock migration below finishes them.

## Migration (post-unlock, idempotent, per exam)

1. Runs after `openWorkspace()` reports `ok`, under a Web Lock `examance-pseudonym-rekey` that the results mover also takes (they never interleave). A Dexie meta row `pseudonymRekey: {keyId, doneExamIds}` records progress.
2. Per exam with version 1, on the side where results live (`resultsAreLocal()`): load students and submissions through their repositories, compute `new` for each, then
   - all-server: one `rekey` call; on 409 re-read the exam (another browser did it) and go on;
   - hybrid: one Dexie transaction rewriting the rows under the new key (and AAD, below), then the version.
3. An exam whose rows fail to decrypt (`decryptFailed`) is skipped and retried at the next unlock, never rewritten (frontend `CLAUDE.md` rule).
4. Archives and ZIP imports carry pseudonyms as they are (v1 or v2 plus the version); the importer converts them into the importing account's `K_exam`, so an archive never depends on the exporting account's key.

Rollback: forward only. A failed run leaves exams at version 1, which still work; nothing is deleted before the new rows exist.

## AAD for every codec (S11)

- AAD = `"<kind>:v1:<id>"` with ids lower-cased: `exam`, `exercise`, `resource` (`<exerciseId>:<filename>`), `student` (`<examId>:<pseudonymHmac>`), `submission` (`<submissionId>`), `scan`/`annotation` (`<submissionId>`), `audit` (`<entryId>`), `omr` (`<examId>`), `score` (unchanged).
- Decrypt tries AAD first, then the legacy no-AAD form (the existing `openPayload` pattern); the next ordinary write re-seals with AAD. No bulk re-seal, except students: the re-key above rewrites them anyway, so it seals them with the v2 id.
- A record that opens only without AAD after the migration finished is counted (`console.warn` + the existing decrypt-failure telemetry, no content), so a later release can drop the legacy path.

## Decisions needed

1. HMAC over the old SHA-256 hex (above) instead of over the raw value.
2. The `rekey` endpoint and the `exams.pseudonym_version` column.
3. Dexie v11 with raw ids only inside the encrypted payload (hybrid browsers upgrade on first load; an older tab open during the upgrade is blocked by Dexie's version-change handling).
4. Running the migration automatically after unlock (versus a button in the settings).

## Test plan

- Unit: helper vectors (raw, old hash, 64-hex input), AAD round trips and legacy fallback per codec, rekey endpoint (pairs, 409, idempotence, gating).
- Migration on both modes with a skipped `decryptFailed` row; mover and migration in two tabs (Web Lock); archive export on v1, import into another account on v2.
