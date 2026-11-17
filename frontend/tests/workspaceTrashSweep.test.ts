import 'fake-indexeddb/auto'; // In-memory IndexedDB — must precede the Dexie module
import { describe, expect, it, vi } from 'vitest';
import { writable } from 'svelte/store';

const session = writable<{ sessionKey: CryptoKey | null; role: string; teacherId: string; email: string }>({
  sessionKey: null,
  role: 'teacher',
  teacherId: 't-1',
  email: 'teacher@example.test',
});

vi.mock('../src/lib/stores/session', () => ({
  sessionStore: session,
  hasLegacyLocalVault: () => false,
  removeLegacyLocalVault: () => {},
}));

vi.mock('../src/lib/stores/capabilities', () => ({
  AccountMismatchError: class extends Error {},
  allowedModesFrom: () => ['all-server', 'hybrid'],
  cachedCapabilities: () => null,
  capabilitiesStore: writable(null),
  clearCapabilities: () => {},
  loadCapabilities: async () => ({ storageMode: 'hybrid' }),
}));

const { db } = await import('../src/lib/db/db');
const { openWorkspace } = await import('../src/lib/db/workspace');

describe('opening the workspace (issue #289)', () => {
  it('erases browser trash entries past their grace period', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    session.update((s) => ({ ...s, sessionKey: key }));
    // The first open claims this empty browser for the account.
    expect(await openWorkspace()).toEqual({ state: 'ok' });
    const entry = { groupId: 'g-1', kind: 'student' as const, examId: 'exam-1', deletedAt: '2026-01-01T00:00:00Z', rows: {} };
    await db.trash.bulkPut([
      { ...entry, id: 'old', purgeAfter: '2026-01-08T00:00:00Z' },
      { ...entry, id: 'fresh', purgeAfter: '2999-01-01T00:00:00Z' },
    ]);

    expect(await openWorkspace()).toEqual({ state: 'ok' });
    expect((await db.trash.toArray()).map((row) => row.id)).toEqual(['fresh']);
  });
});
