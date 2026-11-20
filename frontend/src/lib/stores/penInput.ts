/** Whether this device has shown a pen (issue #233): the only owner of the flag. Once set, fingers in the grading view only scroll and zoom; Settings → Pen input resets it. Per device and browser, so it lives in localStorage, never on the account. */

import { writable, type Readable } from 'svelte/store';
import { safeLocalStorage } from '#lib/utils/storage';

const PEN_SEEN_KEY = 'grading_pen_seen';

function read(): boolean {
  return safeLocalStorage.getItem(PEN_SEEN_KEY) === '1';
}

const store = writable(read());

export const penSeenStore: Readable<boolean> = { subscribe: store.subscribe };

let seen = false;
store.subscribe((value) => (seen = value));

/** Records a pen; true only when this is the first one, so the caller can tell the teacher once. */
export function markPenSeen(): boolean {
  if (seen) return false;
  // Storage unavailable (private window): the flag then lasts for this page only.
  safeLocalStorage.setItem(PEN_SEEN_KEY, '1');
  store.set(true);
  return true;
}

/** Lets fingers draw again until the next pen contact. */
export function resetPenDetection(): void {
  safeLocalStorage.removeItem(PEN_SEEN_KEY);
  store.set(false);
}

// Another tab's change (a reset in Settings) applies here too.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === PEN_SEEN_KEY || e.key === null) store.set(read());
  });
}
