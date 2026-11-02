import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '#lib/api/client';
import type { LoadedResults } from '#lib/export/examExport';

const getById = vi.fn();
vi.mock('#lib/repositories/submissionRepository', () => ({ submissionRepository: { getById: (...args: unknown[]) => getById(...args) } }));
vi.mock('#lib/export/gradedPdf', () => ({ renderGradedPdf: vi.fn(async () => new Uint8Array([1])) }));
vi.mock('#lib/grading/scoreBoxes', () => ({ loadScoreBoxContext: vi.fn(async () => null) }));

const { forEachGradedPdf } = await import('#lib/export/examExport');

const sub = (id: string) => ({ id, examId: 'exam-1', pseudonymHmac: id, createdAt: '', hasScan: true });

/** Regression (PR #208): one unreadable scan (503 ERR_BLOB_STORE_UNAVAILABLE) failed the whole share run, because every scan came in one list response. */
describe('forEachGradedPdf', () => {
  it('fetches scans one at a time and turns an unreadable one into a warning', async () => {
    getById.mockImplementation(async (_exam: string, id: string) => {
      if (id === 'broken') throw new ApiError(503, 'ERR_BLOB_STORE_UNAVAILABLE', 'unavailable');
      return { ...sub(id), scanCt: new Uint8Array([9]), scanIv: new Uint8Array(12) };
    });
    const results = {
      submissions: [sub('ok-1'), sub('broken'), sub('ok-2')],
      students: [],
      scoreRecords: [],
      computed: { stats: { results: [] } },
      rows: [],
    } as unknown as LoadedResults;
    const rendered: string[] = [];

    const warnings = await forEachGradedPdf(results, {} as CryptoKey, null, (_pdf, _row, _state, name) => {
      rendered.push(name);
    });

    expect(getById).toHaveBeenCalledTimes(3);
    expect(rendered).toHaveLength(2);
    expect(warnings).toHaveLength(1);
  });
});
