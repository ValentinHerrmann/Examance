import 'fake-indexeddb/auto'; // In-memory IndexedDB — must precede the Dexie module
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '../src/lib/api/client';
import { reviewRepository } from '../src/lib/repositories/reviewRepository';
import { storagePolicyStore } from '../src/lib/stores/storagePolicy';

vi.mock('../src/lib/api/client', () => ({ api: { get: vi.fn(), put: vi.fn() } }));

describe('reviewRepository.getBySubmission (all-server)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storagePolicyStore.setPolicy({ storageMode: 'all-server', latexCompilation: 'local' });
  });

  it('reads the 200 JSON null of a submission without a review as no review', async () => {
    vi.mocked(api.get).mockResolvedValue(null);
    await expect(reviewRepository.getBySubmission('exam-1', 'sub-1', null)).resolves.toBeNull();
  });

  it('lets a failed read throw instead of reading as no review', async () => {
    vi.mocked(api.get).mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    await expect(reviewRepository.getBySubmission('exam-1', 'sub-1', null)).rejects.toThrow('boom');
  });
});
