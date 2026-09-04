import { writable } from 'svelte/store';

/**
 * When the login cooloff lifts.
 *
 * The server has always said this — `Retry-After` on the 429, exposed to the
 * browser by `expose_headers` — and the client threw it away, leaving a teacher
 * with "try again later" and a wait that is anywhere from one minute to an hour
 * depending on how many attempts preceded it.
 *
 * A deadline rather than a countdown: a tab left open for a minute would drift
 * from a stored remaining-seconds value, and every reader needs the same answer.
 */
export interface LoginLockoutState {
  /** Epoch ms at which attempts start working again, or null when not locked. */
  lockedUntil: number | null;
}

function createLoginLockoutStore() {
  const { subscribe, set } = writable<LoginLockoutState>({ lockedUntil: null });

  return {
    subscribe,

    /** Record a cooloff of *seconds* from now. Ignores nonsense values. */
    start(seconds: number) {
      if (!Number.isFinite(seconds) || seconds <= 0) {
        return;
      }
      set({ lockedUntil: Date.now() + seconds * 1000 });
    },

    clear() {
      set({ lockedUntil: null });
    },
  };
}

export const loginLockout = createLoginLockoutStore();

/** Whole seconds left, floored at zero. */
export function remainingSeconds(lockedUntil: number | null): number {
  if (lockedUntil === null) {
    return 0;
  }
  return Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
}

/** `m:ss`, which stays readable across the whole one-minute to one-hour range. */
export function formatRemaining(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
