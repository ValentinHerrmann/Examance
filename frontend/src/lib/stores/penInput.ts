/** Whether this device has shown a pen (issue #233): the only owner of the flag. Once set, fingers in the grading view only scroll and zoom; Settings → Pen input resets it. Per device and browser, so it lives in localStorage, never on the account. */

import { writable, type Readable } from 'svelte/store';

const PEN_SEEN_KEY = 'grading_pen_seen';

function read(): boolean {
  try {
    return localStorage.getItem(PEN_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function write(seen: boolean): void {
  try {
    if (seen) localStorage.setItem(PEN_SEEN_KEY, '1');
    else localStorage.removeItem(PEN_SEEN_KEY);
  } catch {
    // Storage unavailable (private window): the flag then lasts for this page only.
  }
}

const store = writable(read());

export const penSeenStore: Readable<boolean> = { subscribe: store.subscribe };

let seen = false;
store.subscribe((value) => (seen = value));

/** Records a pen; true only when this is the first one, so the caller can tell the teacher once. */
export function markPenSeen(): boolean {
  if (seen) return false;
  write(true);
  store.set(true);
  return true;
}

/** Lets fingers draw again until the next pen contact. */
export function resetPenDetection(): void {
  write(false);
  store.set(false);
}

// Another tab's change (a reset in Settings) applies here too.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === PEN_SEEN_KEY || e.key === null) store.set(read());
  });
}
