# Storage modes: strategy and invariants

Issue #47 ("Ensure consistent mode switching") reported that modes got mixed up, that server data appeared in local mode, and that the mode changed on its own. It took three rounds:

1. **Round 1** bound the data in each browser to an owner and a mode.
2. **Round 2** made the UI state-accurate.
3. **Round 3** (the current design) reshaped the product: local mode is gone, the mode belongs to the account, and switching is a fluent move of the results.

## Model

- **Every session is an account session.** The local passphrase vault and the `all-local` mode were discontinued; there is no migration (see "Legacy local data").
- **Exams and exercises always live on the server.** The storage mode only decides where grading results live. Grading results are students, submissions with their scans and annotations, and per-exercise scores.

  | Mode | Results live in |
  |---|---|
  | `all-server` | On the server, client-side encrypted except `total_score` |
  | `hybrid` | Only in the browser where they were recorded (IndexedDB, encrypted) |

- **The mode belongs to the account.** It is stored in `teachers.storage_mode` (Alembic `0024`) and every browser of the account follows it.
  - It is nullable, with **no default**. Nothing ever sets it implicitly.
  - Until the account chooses, `openWorkspace()` returns `needs-choice`. The root layout then keeps routes unmounted and opens the settings modal (`StoragePolicyModal`, `mustChoose`) in a non-dismissible state.
  - **Admin accounts have no mode** (issue #58): they hold no exams or results. `openWorkspace()` returns `admin` for them: it loads the capabilities only to bind the tab to its account, never checks, claims or replaces this browser's workspace and never asks for a mode. Everything gated on the `ok` state (offline-queue replay, the result banners) therefore skips admins.
- **Capabilities** (`GET /user/capabilities` returns `{account_id, storage_mode, allowed_storage_modes, features}`). It is built by the single function `capabilities_for(teacher)` in `backend/app/services/capabilities.py`. Since issue #53 an admin sets two switches per account, stored as `teachers.allow_server_results` and `allow_server_latex` (both default to on, and accounts that existed before kept everything); the Admin UI (`/admin/users`) and `PATCH /admin/users/{id}/features` change them, and new accounts get them from the invitation, the approval or the always-allowed domain they registered with. They are **enforced** on both sides: the UI offers only what `frontend/src/lib/stores/capabilities.ts` allows, and the server refuses what the account may not use.
  - `server_results`: whether `all-server` is allowed. `hybrid` is always allowed, so a teacher's `allowed_storage_modes` is never empty (an admin's is, along with every feature). `capabilities_for` reports `["hybrid"]` without it.
  - `server_latex`: whether LaTeX may be compiled on the server. Exams and exercises always live on the server and have **no** switch.
  - **Freshness and ownership.** The frontend asks at every unlock, again whenever the tab comes back into view (at most every 30 s, `refreshCapabilities()` in `lib/db/workspace.ts`) and when the settings page opens, so an admin's change applies without signing in again. A changed answer re-runs `openWorkspace()`. The answer carries `account_id`; the per-tab cache is only used for the same account and is cleared at sign-out. If the server answers for a different account than the tab signed in as (another tab of the same browser signed in as someone else, and the access cookie is shared), the tab locks itself instead of showing that account's options or data.
  - The frontend renders every mode and server-feature option from `stores/capabilities.ts`, never from a hard-coded list. A disallowed option shows "not enabled for your account". Compile sites pick their engine through `effectiveLatexCompilation()` (never the raw preference), so without `server_latex` they compile locally in the browser.
  - `PUT /user/storage-mode {mode, expected}` is compare-and-set: 409 `ERR_STORAGE_MODE_CHANGED` when another browser changed it, 403 `ERR_STORAGE_MODE_NOT_ALLOWED` when the mode is not allowed.
  - Server-side gates (`ERR_FEATURE_NOT_ALLOWED`, 403): `POST /compile/latex` and `POST /exams/{id}/compile` need `server_latex`. The result **write** endpoints (`POST /exams/{id}/students`, `POST /exams/{id}/submissions`, `PATCH …/submissions/{id}/score`, `PUT …/scores`, `POST /user/restore-server-data`) need `server_results`, **unless** the account's stored mode is still `all-server` (see "Revoking `server_results`"). Reads and deletes are never gated.

## Revoking `server_results`

An admin can switch `server_results` off for an account whose results already live on the server. Nothing is deleted or moved by the switch itself, and nothing is lost:

1. The account's stored mode stays `all-server`, but `capabilities_for` no longer lists it as allowed. On the next unlock `openWorkspace()` sees a mode that is not allowed and returns `needs-choice` (the same path as a first choice), so routes stay unmounted and the storage modal opens, non-dismissible.
2. The choice offers only the allowed modes, i.e. `hybrid`. Choosing it runs the normal move (below) from the **server's recorded mode**: `StorageModeSwitchWizard` takes `from` from the capabilities answer when the workspace has published no mode, because the compare-and-set compares against the server's value. The results are read from the server (reads are never gated), written to the browser and verified, then the mode is committed and the old server copy is kept or soft-deleted, as asked.
3. Until that move has happened the account keeps its write access to the server. The gate on result writes lets an account through while its stored mode is `all-server`, because refusing those writes would strand grading done in the meantime in the offline queue. Once the mode is `hybrid` the writes are refused; in that mode the client keeps results in the browser and does not send them to the server anyway.
4. Offline with no cached capabilities, a tab trusts the mode its browser last worked in instead of allowing nothing, so it is not stranded in a choice it cannot make.

Revoking `server_latex` needs no move: the compile sites fall back to local compilation, and the server refuses a compile request that still arrives.

## Why the switch is fluent now

Round 1 rejected fluent mixing. Two things made it unsafe then: local mode had its own passphrase key, and exams lived in two different stores. Both are gone.

Both modes now seal under the same account data key, and only the results move. A move therefore needs no re-encryption, no export/wipe/import, and no data-loss window.

## The move (`frontend/src/lib/services/resultsMover.ts`)

1. **Preconditions.** Flush the offline queue; refuse while writes for this workspace are still pending (`PendingWritesError`, "send now"). Record the move in `bg_pending_mode_switch`, so other tabs show a blocking overlay (`stores/workspaceSync.ts`).
2. **Copy, per exam.** Read the results from the source side, then write them to the destination:
   - **Server → browser:** `GET` students, `submissions?include_scans=true`, and scores.
   - **Browser → server:** students by `POST` (upsert on pseudonym), submissions by `POST` with id (upsert), scores by `PUT` (upsert on submission+exercise).

   A record that fails to decrypt aborts the move rather than being re-sealed as blanks.
3. **Verify** the destination counts per exam (`MoveVerificationError`).
4. **Commit.** Write the account's mode with compare-and-set on `from`, publish it, remember it in the manifest, and announce it (`bg_mode_changed`) so other tabs reload.
5. **Old copy, asked each time.** The user keeps it or deletes it:
   - **To the browser:** `POST /user/purge-server-student-data` soft-deletes, with a 7-day grace period.
   - **To the server:** the local result tables are cleared in one Dexie transaction.
6. **Reload** the page, because every list was loaded under the old mode.

**Interruptions and leftovers:**
- **Interrupted move:** every write is an idempotent upsert, so it is simply run again. The layout shows "run again" when a pending record exists that this tab does not own.
- **Stray local results:** an `all-server` browser that still holds local results (for example a former hybrid browser after another browser switched the account) shows a banner. It runs the same mover towards the server.
- **Hybrid browser without results:** shows a hint that results live only in the browser where they were recorded.

**The first choice** runs through the same dialog with `from = null`. If neither side holds results, the choice is just the compare-and-set write.

## Workspace manifest and owner binding (`frontend/src/lib/db/workspace.ts`)

**The manifest** is a single-row `workspace` table holding `workspaceId`, the last known mode (an offline copy only), the owner (account id, e-mail, backend), and a key canary.

**Owner check.** `openWorkspace()` runs after every unlock and before routes mount:
- The canary must decrypt, and the account and backend must match.
- An unclaimed manifest is claimed if its existing data opens with the session key.
- Data without local results (only a cache) of another owner is replaced silently.
- Otherwise the session is blocked:
  - `foreign-account` / `foreign-key`, with a confirmed reset;
  - `pending-writes` when another account's offline writes wait.
- Unbound offline-queue entries are stamped only after the owner check passes.

**Resetting the workspace** (`replaceWorkspace`) is one transaction: every data table is cleared and the new manifest written. It also clears the offline queue and the compile cache.

**Cross-tab coherence:** a change of `bg_workspace_id` or `bg_mode_changed` reloads every other tab.

**`teacherId` in the multi-tab handover:** it is part of the `PROVIDE_KEYS` broadcast. Without it, a restored tab compared an e-mail against a teacher id and treated the account as foreign.

## Legacy local data

A pre-#47 browser has no manifest. One is created from what the browser had cached (`legacyCachedMode()`), and the old per-browser key `bg_storage_policy` is then removed:
- **No cache, or `all-local`, with data:** the manifest gets the mode `all-local`, which marks legacy local data.
- **A cached `hybrid` or `all-server` with data:** kept as the offline copy, so the results of a former hybrid browser stay recognised. The account still has to choose its mode on the server.
- **Leftover passphrase parameters** (`bg_anon_*`) next to unclaimed data are also treated as legacy local data.

Legacy local data is never opened. The blocked screen (`legacy-local`) offers only "delete and continue", which removes the data and the `bg_anon_*` keys.

## Archives (`frontend/src/lib/archive/`)

- **Bytes are base64.** They are encoded as `{ $b64 }` (`binary.ts`). Plain `JSON.stringify` had turned every `Uint8Array` into an object nobody could read, so scans were lost. Old numbered-key objects are still decoded.
- **Scans travel decrypted.** Scans, annotations and audit notes go inside the password envelope (Argon2id + AES-GCM), like names, scores and resource files already did. The importer re-seals them under its own key, so an archive opens for another account.
- **Results-only export.** The "Share results (without exercise texts)" menu entry calls `packProject(…, { includeExerciseCode: false })`. It keeps exams, students, scans, annotations, scores, exercise names, points and MC answer keys, but no LaTeX and no resource files.
  - The imported exercises carry `exercises.code_withheld` (Alembic `0025`).
  - Grading, verification and statistics work.
  - Compiling, editing and building the OMR template are refused with a message, and the exercise library hides these exercises.
- **Fresh ids on remapped exams.** When an exam gets a fresh id on import, its submissions and their score rows get fresh ids too. This prevents cross-account collisions on the same server, which used to 409 silently into the offline queue.
- **Import links, it does not duplicate.**
  - Identical records (`detectConflicts` → `identical`) are dropped by `applyResolutions` and reported as "already present"; re-POSTing them used to 409 and come back as duplicates.
  - Conflict probes for students and submissions run only for exams the account owns (`ownExamIds`). A foreign exam id answered 401, which opened an error pop-up and triggered a token refresh.
  - An archived exercise the server already lets this account read (`GET /exercises/{id}`: own or public, later shared) is linked instead of created. Exam links to exercises the archive lacks are probed the same way.
  - A link that cannot be resolved is dropped and listed as missing; scores for that exercise are not sent (they would 404 per submission).
- **Export collects what the exams link.** Linked exercises missing from `GET /exercises` (older versions) are fetched one by one. A results-only export holds only linked exercises, never the rest of the library. A scan that does not decrypt is skipped and reported instead of failing the export.
- **Reports, not pop-ups.** Import and export fill an `ArchiveReport` (`archive/report.ts`: counts per kind and outcome, missing items, withheld items, technical problems). `ArchiveReportModal` (driven by `stores/archiveReport.ts`) shows it once the work is done; callers reload only after it is closed. Both run inside `collectHttpErrors` (`stores/httpErrorStore.ts`), which records HTTP errors into the report's technical details instead of opening the global error modal.

## Tests

- **Unit tests:** `frontend/tests/storageModeSwitch.test.ts`, `storagePolicy.test.ts`, `archive.test.ts` (round trips, linking, reports; `tests/helpers/fakeServer.ts` logs requests), `archiveBinary.test.ts`, `backend/tests/test_storage_mode.py`.
- **The e2e suite** (`frontend/e2e/`) still signs in through the removed passphrase vault and runs without a backend. It needs a backend or API-mock fixture before it can run again; it is not part of CI.
