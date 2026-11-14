import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '#lib/api/client';
import type { LoadedResults } from '#lib/export/examExport';

const getById = vi.fn();
vi.mock('#lib/repositories/submissionRepository', () => ({ submissionRepository: { getById: (...args: unknown[]) => getById(...args) } }));
const renderGradedPdf = vi.fn(async (..._args: unknown[]) => new Uint8Array([1]));
vi.mock('#lib/export/gradedPdf', () => ({ renderGradedPdf: (...args: unknown[]) => renderGradedPdf(...args) }));
vi.mock('#lib/repositories/reviewRepository', () => ({ reviewRepository: { listByExam: vi.fn(async () => []) } }));
vi.mock('#lib/grading/scoreBoxes', () => ({ loadScoreBoxContext: vi.fn(async () => null) }));

const { addGradedScans, forEachGradedPdf } = await import('#lib/export/examExport');
const { DEFAULT_REVIEW_PRINT } = await import('#lib/export/reviewPrint');

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

/** Regression (issue #226): a ZIP run with the combined print file attached the review to the single files too, and the merge dropped it. */
describe('addGradedScans', () => {
  const results = { submissions: [sub('ok-1')], students: [], scoreRecords: [], computed: { stats: { results: [] } }, rows: [] } as unknown as LoadedResults;
  const run = async (combined: { add: () => Promise<void> } | null) => {
    getById.mockResolvedValue({ ...sub('ok-1'), scanCt: new Uint8Array([9]), scanIv: new Uint8Array(12) });
    renderGradedPdf.mockClear();
    const zip = { add: vi.fn() };
    await addGradedScans({ zip: zip as never, results, key: {} as CryptoKey, fallbackKey: null, progress: vi.fn(), singleFiles: true, combined: combined as never, reviewPrint: { ...DEFAULT_REVIEW_PRINT, attach: true } });
    return (renderGradedPdf.mock.calls[0][3] as { review: { options: { attach: boolean } } }).review.options.attach;
  };

  it('never attaches the review while the combined file is built', async () => {
    expect(await run({ add: vi.fn(async () => undefined) })).toBe(false);
  });

  it('keeps the attachment for single files only', async () => {
    expect(await run(null)).toBe(true);
  });
});
