# Storage modes: consistency strategy

Issue #47 ("Ensure consistent mode switching") reported three symptoms: modes got mixed up, server data appeared while all-local was selected, and the mode changed on its own. This page records the decision on how to prevent that, and the invariants the code enforces. Product-level data flow is in `docs/data_flow_and_security.md`.

## Root causes found

1. **Silent adoption.** `adoptServerStorageIfLocalEmpty()` ran at every sign-in and on every authenticated reload, flipping `all-local` to `all-server` whenever the workspace looked empty. Example: switch to all-local, choose "import later", reload. The mode was all-server again, showing server data.
2. **One unlabelled database.** Local data and the server mirror (`examSync.ts`, page loaders) share the same Dexie tables. Nothing recorded which mode, account, backend or key the rows belonged to.
3. **Non-atomic switch.** The mode was committed first, then the wipe ran, and its failure was ignored (`clearAllTables()` swallowed every error). The server mirror could survive into all-local.
4. **No cross-tab coherence.** A tab still holding the old mode kept routing to the old store. Changing the LaTeX engine there wrote the stale mode back into `bg_storage_policy`.
5. **Mode-blind offline queue.** Queued server writes were replayed after a switch to all-local, or under another account's cookies.

## Decision: strict data separation, fluent session

The issue offered two options:

1. Strict separation: forced export and logout, full data clear.
2. Fluent combination: switching without logout.

We chose **option 1 for the data, without forcing a logout.**

**Why not fluent mixing.**
- It needs two-way sync between an end-to-end-encrypted IndexedDB and the server: per-record origin, tombstones, conflict resolution, and reconciling passphrase-vault keys with account keys.
- Every bug above is a symptom of the implicit mixing that already existed. Making it official would multiply those edge cases.
- It would also make the privacy guarantees unprovable. "Student identities never leave this device" (hybrid) and "nothing is stored on a server" (all-local) only hold when every record has exactly one home.

**Why no forced logout.**
- Signing in is *identity*; the storage mode is *data location*.
- Forcing a logout in all-local would only remove stateless services (server LaTeX compile, training donation) and buy no consistency.
- Consistency comes from binding the *data* to a mode and an owner.

**Server LaTeX compile with local data** is allowed: it is processing, not storage. `routers/compile.py` compiles in a temp directory and neither persists nor logs the source. Enabling it in all-local asks for consent once, because the exam LaTeX (including solutions) and its files do leave the device.

**The server copy after leaving `all-server`** is offered for deletion after a verified import, not forced. The wizard step calls `POST /user/purge-server-student-data`, which soft-deletes with a 7-day grace period. Exams and exercises stay on the server.

## Invariants

| # | Invariant | Where |
|---|---|---|
| I1 | A single-row `workspace` table (Dexie v10) is the source of truth for the mode. It stores `{workspaceId, mode, owner, canary, explicit}` in the same database as the data. `bg_storage_policy` is only a boot cache, rewritten from the manifest on load. The LaTeX engine has its own key, `bg_latex_compilation`. | `lib/db/workspace.ts`, `lib/stores/storagePolicy.ts` |
| I2 | A mode change is one transaction: every data table is cleared and the new manifest written together. On failure the old mode and all its data remain. The offline queue and the compile cache are cleared with it. | `replaceWorkspace()` |
| I3 | A session opens the workspace only if it owns it. A known constant sealed under the data key (the canary) must decrypt. A server-backed workspace must also belong to the signed-in account on the same backend. Unclaimed (legacy) workspaces are claimed at the first unlock whose key opens the existing data. | `openWorkspace()`, called by `/unlock` and the root layout |
| I4 | Nothing changes the mode implicitly. The only exception is an explicit sign-in on a workspace that nobody chose a mode for (`explicit: false`) and that holds no data and no queued writes: it adopts `all-server`. That adoption counts as a choice. Reloads never adopt. | `adoptServerStorageIfPristine()` |
| I5 | Server-backed workspaces require an account session. A passphrase session on one is blocked (`needs-sign-in`). The `isServerBacked()` and mode-only checks in repositories therefore agree whenever routes are mounted. | `openWorkspace()` |
| I6 | Any workspace replacement updates `bg_workspace_id` in localStorage, which reloads every other tab. A switch in progress (`bg_pending_mode_switch`) blocks the other tabs behind an overlay. | `lib/stores/workspaceSync.ts` |
| I7 | Offline-queue entries carry the `workspaceId`. They are replayed only into that workspace, and only while it is server-backed and open. A switch is refused while the current workspace still has queued writes ("send now" first). | `lib/services/offlineQueue.ts`, `beginModeSwitch()` |
| I8 | IndexedDB fallbacks in server modes read only the cache of the workspace the session owns (guaranteed by I3). | repositories |

## Owner mismatch handling

When I3 fails, the root layout renders `WorkspaceBlocked` instead of any route, so nothing reads or writes the vault. What happens depends on the case:

| Case | Behaviour |
|---|---|
| Empty workspace, no queued writes | Taken over silently (nothing to lose). |
| `all-server`, other owner, no queued writes | The local cache is dropped and re-claimed (the data is on the server). |
| `all-server`, other owner, queued writes | Blocked (`pending-writes`): sign in as the other account, or reset to discard. |
| `hybrid`, other account or backend | Blocked (`foreign-account`): the local results are real data. |
| Key does not open the canary | Blocked (`foreign-key`). Example: a local passphrase vault opened by an account sign-in, or the other way round. |
| Server-backed workspace, passphrase session | Blocked (`needs-sign-in`). |

Every blocked screen offers "sign out and use the matching credentials", plus a confirmed reset that deletes this browser's data. Bridging a passphrase vault into an account key is out of scope: use an archive export and import.

## Switch flow

The steps are confirm → export (or an explicit skip) → `commitModeSwitch()` → import → optional server purge.

`commitModeSwitch()` runs `replaceWorkspace()`, which is atomic. A reload between steps resumes the switch. A reload during `switching` checks the manifest: if the mode already changed it continues at the import, otherwise it returns to the wipe step.

## UX rules

- **Local sessions without an account are first-class.** The passphrase door always works for an all-local workspace protected by a passphrase. Server-only options (server modes, server LaTeX) are shown disabled with "only available when signed in", not hidden and not failing later.
- **The unlock page shows what this browser holds** ("In this browser: All Local · protected by your passphrase" or "… belongs to account x@y (host)"). It also marks the door that opens it. The other door explains up front why it won't open this data and what to do instead.
- **A wrong passphrase is reported inline as a wrong passphrase.** The canary detects it before entering the app, and the keys are dropped. It never leads to a reset offer.
- **Blocked states name the owner and lead with the way back in** (sign out and use the right door). A reset is the last resort, behind a confirmation, with an extra warning when hybrid student data would be lost. A passphrase user facing a server-backed workspace gets "Start a local workspace": the server copy stays untouched and only this browser's cache goes.
- **Displayed state is always the committed state.** Mode and LaTeX radios never toggle themselves (`preventDefault` on click). The checked option moves only when the store does, so a cancelled wizard or a declined consent leaves the UI on the real setting. The account menu shows the *session* ("Signed in with account" / "Local session (no account)"); the storage badge shows the *mode*. The two are never conflated.
