import 'fake-indexeddb/auto'; // In-memory IndexedDB — must precede the Dexie module
import { describe, expect, it, vi } from 'vitest';

import { decryptReview, encryptReview } from '../src/lib/db/dbEncryption';
import type { GradingReviewRecord } from '../src/lib/db/schema';

async function aesKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new Uint8Array(32).fill(7), { name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

const review = (): GradingReviewRecord => ({
  id: 'rv-1',
  submissionId: 'sub-A',
  items: [{ key: 'ex-1', label: '1', objection: 'Why?', reply: 'Because.', pointsBefore: 2, pointsAfter: 3 }],
  submittedAt: '2026-01-01T10:00:00Z',
  repliedAt: null,
});

describe('grading review payload bound to its submission (issue #226)', () => {
  it('round-trips and seals the thread', async () => {
    const key = await aesKey();
    const sealed = await encryptReview(review(), key);
    expect(sealed.payloadCt).toBeDefined();
    expect('items' in sealed && sealed.items).toBeFalsy();
    const opened = await decryptReview(sealed, key);
    expect(opened.decryptFailed).toBeUndefined();
    expect(opened.items[0].reply).toBe('Because.');
    expect(opened.repliedAt).toBeNull();
  });

  it('refuses a payload moved to another submission', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const key = await aesKey();
    const sealed = await encryptReview(review(), key);
    const opened = await decryptReview({ ...sealed, submissionId: 'sub-B' }, key);
    expect(opened.decryptFailed).toBe('error');
  });
});
