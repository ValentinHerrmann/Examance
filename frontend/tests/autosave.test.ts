import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { createAutosave } from '../src/lib/utils/autosave';

describe('createAutosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces edits into one save', async () => {
    const run = vi.fn(async () => {});
    const save = createAutosave({ run, delayMs: 100 });
    save.schedule();
    save.schedule();
    expect(get(save).state).toBe('pending');
    await vi.advanceTimersByTimeAsync(100);
    expect(run).toHaveBeenCalledTimes(1);
    expect(get(save).state).toBe('saved');
    expect(save.busy).toBe(false);
  });

  // Regression (issue #228): an edit made while a save ran was never saved and the status hung on "Saving…".
  it('saves again for an edit made during a save', async () => {
    let release!: () => void;
    const run = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const save = createAutosave({ run, delayMs: 100 });
    save.schedule();
    await vi.advanceTimersByTimeAsync(100);
    save.schedule();
    await vi.advanceTimersByTimeAsync(100);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(get(save).state).toBe('saved');
    expect(save.busy).toBe(false);
  });

  it('reports a failed save and stops', async () => {
    const save = createAutosave({ run: async () => Promise.reject(new Error('offline')), delayMs: 10 });
    save.schedule();
    await vi.advanceTimersByTimeAsync(10);
    expect(get(save)).toEqual({ state: 'error', error: 'offline' });
    expect(save.busy).toBe(false);
  });

  it('shows immediate saves through track', async () => {
    const save = createAutosave({ run: async () => {} });
    const work = save.track(Promise.resolve(1));
    expect(get(save).state).toBe('saving');
    await expect(work).resolves.toBe(1);
    expect(get(save).state).toBe('saved');
  });

  it('saves a waiting edit on dispose', async () => {
    const run = vi.fn(async () => {});
    const save = createAutosave({ run, delayMs: 1000 });
    save.schedule();
    save.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
