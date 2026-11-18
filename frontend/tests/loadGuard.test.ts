import { describe, expect, it } from 'vitest';
import { createLoadGuard } from '#lib/utils/loadGuard';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('createLoadGuard', () => {
  it('keeps the newer load when the older one resolves last', async () => {
    const guard = createLoadGuard();
    let shown = '';
    const load = async (pending: Promise<string>) => {
      const isStale = guard.begin();
      const value = await pending;
      if (!isStale()) shown = value;
    };
    const examA = deferred<string>();
    const examB = deferred<string>();
    const first = load(examA.promise);
    const second = load(examB.promise);
    examB.resolve('B');
    await second;
    examA.resolve('A');
    await first;
    expect(shown).toBe('B');
  });

  it('never marks a single load stale', () => {
    const isStale = createLoadGuard().begin();
    expect(isStale()).toBe(false);
  });
});
