// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';

describe('offline queue with blocked storage (issue #299)', () => {
  // Regression: the legacy-queue cleanup called localStorage.removeItem unguarded, so a browser that blocks storage rejected every queue hydrate.
  it('moves the legacy queue in even when removing it throws', async () => {
    const legacy = JSON.stringify([{ id: 'legacy-1', url: '/exams/e', method: 'PATCH', body: {}, timestamp: 1 }]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key === 'bg_offline_queue' ? legacy : null),
      setItem: () => {},
      removeItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    const { withQueueHeld } = await import('../src/lib/services/offlineQueue');
    await expect(withQueueHeld(async () => 'done')).resolves.toBe('done');
    vi.unstubAllGlobals();
  });
});
