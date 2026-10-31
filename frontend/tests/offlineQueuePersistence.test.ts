// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

describe('offline queue persistence (F4)', () => {
  it('moves the legacy localStorage queue into IndexedDB and keeps new writes there', async () => {
    localStorage.setItem(
      'bg_offline_queue',
      JSON.stringify([{ id: 'legacy-1', url: '/exams/e', method: 'PATCH', body: {}, timestamp: 1 }]),
    );
    const { db } = await import('../src/lib/db/db');
    const { offlineQueue, enqueueRequest } = await import('../src/lib/services/offlineQueue');

    await vi.waitFor(() => expect(localStorage.getItem('bg_offline_queue')).toBeNull());
    enqueueRequest('/exams/e/submissions', 'POST', { id: 's1' });

    await vi.waitFor(async () => {
      const stored = await db.offlineQueue.toArray();
      expect(stored.map((r) => r.id)).toContain('legacy-1');
      expect(stored.some((r) => r.url === '/exams/e/submissions')).toBe(true);
    });
    expect(get(offlineQueue).map((r) => r.id)[0]).toBe('legacy-1');
  });
});
