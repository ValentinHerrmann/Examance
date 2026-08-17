/**
 * Safe wrappers around localStorage and sessionStorage.
 *
 * Some browsers report `typeof localStorage === 'object'` but then throw a
 * SecurityError when the API is actually accessed — this happens in:
 *   - Firefox private browsing with certain settings
 *   - Any browser with "Block all cookies / site data" turned on
 *   - Safari ITP in some third-party contexts
 *
 * Using `typeof x !== 'undefined'` as a guard is therefore NOT sufficient;
 * every actual read/write must be wrapped in a try-catch.
 *
 * Rule: import from here instead of accessing localStorage / sessionStorage
 * directly.  All functions are synchronous and never throw.
 */

function safeGet(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(store: Storage, key: string, value: string): void {
  try {
    store.setItem(key, value);
  } catch {
    // Storage quota exceeded or access denied — silently ignore.
    // The app degrades gracefully: it just won't remember the setting.
  }
}

function safeRemove(store: Storage, key: string): void {
  try {
    store.removeItem(key);
  } catch {
    // Silently ignore
  }
}

function probeStore(name: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    // In SSR / Node the global doesn't exist at all.
    const s = name === 'localStorage' ? localStorage : sessionStorage;
    // Probe with a harmless read to detect "defined but forbidden" contexts.
    s.getItem('__probe__');
    return s;
  } catch {
    return null;
  }
}

// Lazily cached after first SUCCESSFUL probe. A null result is never cached so
// that the probe is retried on every call — this lets test environments (and
// late-initialising browser APIs) inject storage after module load time.
let _ls: Storage | undefined;
let _ss: Storage | undefined;

function ls(): Storage | null {
  if (_ls === undefined) {
    const found = probeStore('localStorage');
    if (found) _ls = found;
    return found;
  }
  return _ls;
}

function ss(): Storage | null {
  if (_ss === undefined) {
    const found = probeStore('sessionStorage');
    if (found) _ss = found;
    return found;
  }
  return _ss;
}

export const safeLocalStorage = {
  getItem: (key: string): string | null => ls() ? safeGet(ls()!, key) : null,
  setItem: (key: string, value: string): void => { if (ls()) safeSet(ls()!, key, value); },
  removeItem: (key: string): void => { if (ls()) safeRemove(ls()!, key); },
  /** True when localStorage is accessible in this browser context. */
  isAvailable: (): boolean => ls() !== null,
};

export const safeSessionStorage = {
  getItem: (key: string): string | null => ss() ? safeGet(ss()!, key) : null,
  setItem: (key: string, value: string): void => { if (ss()) safeSet(ss()!, key, value); },
  removeItem: (key: string): void => { if (ss()) safeRemove(ss()!, key); },
  /** True when sessionStorage is accessible in this browser context. */
  isAvailable: (): boolean => ss() !== null,
};
