# Session keys across reloads: sealed under a per-tab key (S10 part 2)

Status: **signed off 2026-10-31, implemented** (issue #179). The first half of S10 (zero-filling key bytes on lock) shipped with #173.

## Problem

To survive an F5 reload, the unlocked tab kept its key material in `sessionStorage` as base64: the data key (`bg_session_master_key_raw`), the AES-GCM session key and the fallback/legacy pairs. Anything that reads `sessionStorage` got the keys in one call: a browser extension or tool that dumps storage, the session-restore files a browser writes to disk, a copied profile.

## Design

- **Wrapping key.** Each tab has a random AES-GCM-256 key, generated with `extractable: false`, kept in its own IndexedDB database `examance-session-wrap` (store `keys`, keyed by a random tab id). It is outside Dexie on purpose: no version bump blocks open tabs, and `vaultTables()`, `clearAllTables` and `replaceWorkspace` never touch it. Code: `frontend/src/lib/crypto/sessionWrap.ts`.
- **What sessionStorage holds.** `bg_session_tab` (the tab id) and `bg_session_sealed` (the six secret entries as one JSON, sealed with a fresh IV and AAD `session-wrap:v1:<tabId>`). Nonce, e-mail, account id, role, mode and key id stay plain; they are not secret. No raw key entry is ever written; the sealed copy is stored before raw entries are removed, so a crash in between costs a sign-in, never a raw key at rest.
- **Reload.** `restoreFromSessionStorage()` reads the tab id, loads the wrapping key, opens the record and imports the keys as before. A missing key or a record that does not open behaves like an empty `sessionStorage`: the layout asks other tabs (BroadcastChannel) and then sends the user to `/unlock`.
- **Lock and sign-out.** `lock()` clears `sessionStorage` synchronously and drops **every** tab's wrapping key (every tab locks with it). Other tabs, on the lock broadcast, drop their own. `reset()` (account mismatch) drops only this tab's key. All IndexedDB writes run through one promise chain, so a drop never lands after the key of a quick re-unlock.
- **Duplicated tab.** Duplicating a tab copies `sessionStorage`, tab id included. Each tab holds the Web Lock `examance-tab:<tabId>` for its lifetime; a tab that cannot claim the id it found is a copy. It still opens the shared record, then mints its own id and key and re-wraps. It never deletes the original's key.
- **Sweep.** At restore, keys whose tab lock no live tab holds and that were not used within the idle timeout (60 minutes, `hygiene.ts`) are deleted: they belong to closed tabs. Without Web Locks there is no sweep and no duplicate detection; the keys go at the next lock.
- **Deploy.** A tab of an older build still holds raw entries. The first restore adopts them, writes the sealed record and removes the raw entries, so nobody is signed out by the update.
- **No IndexedDB or WebCrypto** (some private modes, a blocked origin): nothing secret is persisted (fail closed). F5 then asks other tabs and signs in again.

## Threat model and honest limits

- **Stops:** passive reads of `sessionStorage` (storage dumps, extensions that read storage without running code on the page, session-restore files), and copying a tab's storage into another browser.
- **Does not stop:** script running on the origin. It cannot export the wrapping key, but it can use it to open the record, and it can ask for the keys on the BroadcastChannel (`REQUEST_KEYS`, unchanged, in memory only). Anyone who reaches an unlocked tab reads the data, as before.
- **Disk:** Chromium serializes non-extractable keys into its IndexedDB files unencrypted. Someone holding a copy of the browser profile with both the session-restore data and the IndexedDB files can still recover the keys; the split only raises the bar.
- When the wrapping key is lost (swept, dropped by a lock, profile cleared), the user signs in again. No data is lost; the vault opens from its key envelopes as always.

## Tests

`frontend/tests/sessionStore.test.ts` (jsdom + `fake-indexeddb`):
- no raw key entry after unlock;
- restore in a fresh module instance;
- a missing wrapping key, after which restore fails and the sealed record is cleared;
- lock drops the key;
- a duplicated tab gets its own id and leaves the original key;
- raw entries of an older build are re-wrapped.
