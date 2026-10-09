/**
 * IDB hygiene: best-effort clear-on-close plus session timeout. SECURITY: a courtesy, NOT a guarantee (the unload
 * wipe does not reliably fire on crashes, kills, mobile tab discards). If it fails the data stays safe: a new session
 * cannot derive the key without the password and sensitive fields are encrypted before every write (the PRIMARY protection).
 */

import { clearAllTables } from './db';
import { isUnlocked, sessionStore } from '#lib/stores/session';
import { storagePolicyStore } from '#lib/stores/storagePolicy';
import { workspaceStatusStore } from '#lib/stores/workspaceState';
import { clearCapabilities } from '#lib/stores/capabilities';
import { get, writable } from 'svelte/store';
import { safeLocalStorage } from '#lib/utils/storage';

import { api } from '#lib/api/client';

/** Drops the in-memory compiled-PDF cache. Imported dynamically so the root-layout chunk doesn't pull in the compiler worker asset. */
async function clearCompileCache(): Promise<void> {
  const { clearCompileCache: clear } = await import('#lib/latex/compileCache');
  clear();
}

/** Clear all IDB data and compilation cache. Returns true if successful, false on error. */
export async function wipeDatabase(): Promise<boolean> {
  try {
    await clearCompileCache();
    await clearAllTables();
    return true;
  } catch {
    // Intentionally silenced — wipe failure is non-fatal (data is encrypted-at-rest)
    return false;
  }
}

/** Lock the session: wipe keys from store, set lockedAt, clear compilation cache, and wipe DB if server-synced. */
export async function lockSession(): Promise<void> {
  timeUntilLock.set(null);
  await clearCompileCache();
  sessionStore.lock();
  clearCapabilities();
  // The next unlock decides afresh whether its session owns the workspace.
  workspaceStatusStore.set({ state: 'unchecked' });
  try {
    await api.post('/auth/logout');
  } catch {
    // Non-fatal if offline
  }
  if (get(storagePolicyStore).storageMode === 'all-server') {
    await wipeDatabase();
  }
  if (typeof window !== 'undefined' && window.location.pathname !== '/unlock') {
    window.location.href = '/unlock';
  }
}

/** Inactivity timeout in milliseconds (60 minutes). */
const TIMEOUT_MS = 60 * 60 * 1000;
/** Warning threshold in milliseconds (5 minutes). */
const WARNING_THRESHOLD_MS = 5 * 60 * 1000;
/** Last activity in any tab of this browser: a lock (which every tab follows) needs all of them idle. */
export const LAST_ACTIVITY_KEY = 'bg_last_activity';
const ACTIVITY_WRITE_MS = 15_000;

let tickHandle: ReturnType<typeof setInterval> | null = null;
let lastActivity = 0;
let lastWritten = 0;

export const timeUntilLock = writable<number | null>(null);

function sharedLastActivity(): number {
  const value = Number(safeLocalStorage.getItem(LAST_ACTIVITY_KEY));
  return Number.isFinite(value) ? value : 0;
}

/** Throttled, so mousemove does not write storage on every event; the tick catches up the trailing write. */
function publishActivity(force = false): void {
  if (lastActivity <= lastWritten || (!force && Date.now() - lastWritten < ACTIVITY_WRITE_MS)) return;
  lastWritten = lastActivity;
  if (sharedLastActivity() < lastActivity) safeLocalStorage.setItem(LAST_ACTIVITY_KEY, String(lastActivity));
}

function recordActivity(): void {
  lastActivity = Date.now();
  if (tickHandle !== null) publishActivity();
}

export function keepSessionAlive(): void {
  recordActivity();
  publishActivity(true);
  timeUntilLock.set(null);
}

/** Pure: milliseconds until the idle lock, from the newest activity seen in any tab. */
export function remainingUntilLock(localLast: number, sharedLast: number, now: number): number {
  return Math.max(localLast, sharedLast) + TIMEOUT_MS - now;
}

async function tick(): Promise<void> {
  publishActivity();
  const remaining = remainingUntilLock(lastActivity, sharedLastActivity(), Date.now());
  if (remaining <= 0) {
    disarm();
    await lockSession();
  } else if (remaining <= WARNING_THRESHOLD_MS) {
    timeUntilLock.set(Math.ceil(remaining / 1000));
  } else {
    timeUntilLock.set(null);
  }
}

/** Only while unlocked: a locked tab has nothing to lock (its timer would log out a later sign-in). */
function arm(): void {
  if (tickHandle !== null) return;
  lastActivity = Date.now();
  publishActivity(true);
  tickHandle = setInterval(() => void tick(), 1000);
}

function disarm(): void {
  if (tickHandle !== null) clearInterval(tickHandle);
  tickHandle = null;
  timeUntilLock.set(null);
}

/** Register all hygiene event listeners. Call once on app startup. */
export function registerHygieneListeners(): void {
  // Inactivity timeout — reset on any user interaction
  const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'pointerdown', 'scroll', 'touchstart'];
  ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, recordActivity, { passive: true }));
  isUnlocked.subscribe((unlocked) => (unlocked ? arm() : disarm()));

  // Inactivity timeout — lock session on timeout (data remains safe encrypted at rest)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // Intentionally do not wipe DB on tab switch; encryption-at-rest secures data
    }
  });

  window.addEventListener('beforeunload', (event) => {
    const session = get(sessionStore);
    if (session.isDirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}

