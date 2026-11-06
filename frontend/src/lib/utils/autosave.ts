/** Forms that save themselves (issue #228): one debounced save at a time, a re-run for edits made during it, and one status for the "Saving… / Saved" line (`ui/SaveStatus`). Every self-saving form goes through it. */

import { writable, type Readable } from 'svelte/store';

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface AutosaveStatus {
  state: SaveState;
  /** The failed save's message (state `error`). */
  error: string;
}

export const IDLE_SAVE: AutosaveStatus = { state: 'idle', error: '' };

export interface Autosave extends Readable<AutosaveStatus> {
  /** Saves after *delayMs* without a further call (an edit). */
  schedule(delayMs?: number): void;
  /** Saves now; during a running save, once more after it. */
  flush(): Promise<void>;
  /** Shows an immediate save (one that does not go through `run`) in the status; rethrows its error. */
  track<T>(work: Promise<T>): Promise<T>;
  /** An edit is waiting or a save runs: for leave guards. */
  readonly busy: boolean;
  /** Clears the timer and, when an edit is waiting, saves it (leaving a tab still saves what was typed). */
  dispose(): void;
}

export interface AutosaveOptions {
  /** Saves what changed since the last save; throws on failure. */
  run: () => Promise<void>;
  delayMs?: number;
  /** The status line's text of a failed save. */
  message?: (err: unknown) => string;
}

export const AUTOSAVE_DELAY_MS = 800;

const defaultMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function createAutosave({ run, delayMs = AUTOSAVE_DELAY_MS, message = defaultMessage }: AutosaveOptions): Autosave {
  const status = writable<AutosaveStatus>(IDLE_SAVE);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  // An edit arrived while a save ran: that save may not hold it, so one more follows.
  let again = false;
  let tracked = 0;

  const set = (state: SaveState, error = '') => status.set({ state, error });

  async function runOnce(): Promise<void> {
    set('saving');
    try {
      await run();
      set(tracked ? 'saving' : 'saved');
    } catch (err) {
      again = false;
      set('error', message(err));
    }
  }

  function flush(): Promise<void> {
    if (timer) clearTimeout(timer);
    timer = null;
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await runOnce();
      } while (again);
      running = null;
    })();
    return running;
  }

  return {
    subscribe: status.subscribe,
    schedule(ms = delayMs) {
      if (timer) clearTimeout(timer);
      if (running) again = true;
      else set('pending');
      timer = setTimeout(() => void flush(), ms);
    },
    flush,
    async track<T>(work: Promise<T>): Promise<T> {
      tracked++;
      set('saving');
      try {
        const result = await work;
        tracked--;
        if (!tracked && !running) set('saved');
        return result;
      } catch (err) {
        tracked--;
        set('error', message(err));
        throw err;
      }
    },
    get busy() {
      return timer !== null || running !== null || tracked > 0;
    },
    dispose() {
      if (timer) void flush();
    },
  };
}
