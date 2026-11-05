import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/repositories/studentRepository', () => ({
  studentRepository: { getByExamId: vi.fn(async () => { throw new Error('offline'); }) },
}));

import { copiesUnavailable, loadStickerEntries } from '../src/lib/sharing/stickerEntries';

describe('sticker printing', () => {
  it('reports a failed student read instead of showing "no students yet"', async () => {
    await expect(loadStickerEntries('exam-1', null)).rejects.toThrow('offline');
  });

  it('offers no exam copies for a results-only exam', () => {
    expect(copiesUnavailable([{ codeWithheld: false }])).toBeNull();
    expect(copiesUnavailable([{ codeWithheld: false }, { codeWithheld: true }])).toBeTypeOf('string');
  });
});
