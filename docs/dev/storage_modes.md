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
- **Capabilities.** `GET /user/capabilities` returns `{storage_mode, allowed_storage_modes, features}`. It is built by the single function `capabilities_for(teacher)` in `backend/app/services/capabilities.py`.
  - The frontend renders every mode and server-feature option from `stores/capabilities.ts`, never from a hard-coded list. A disallowed option shows "not enabled for your account".
  - `PUT /user/storage-mode {mode, expected}` is compare-and-set: 409 when another browser changed it, 403 when the mode is not allowed.
  - Per-user admin switches later are a lookup added inside `capabilities_for`, with no API or UI change. If an account's current mode becomes disallowed, the app treats it like `needs-choice`.

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
- **Server writes report errors.** Result writes to the server during import are direct; failures land in the import summary.

## Tests

- **Unit tests:** `frontend/tests/storageModeSwitch.test.ts`, `storagePolicy.test.ts`, `archiveBinary.test.ts`, `backend/tests/test_storage_mode.py`.
- **The e2e suite** (`frontend/e2e/`) still signs in through the removed passphrase vault and runs without a backend. It needs a backend or API-mock fixture before it can run again; it is not part of CI.
