import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GradingReviewItem, GradingReviewRecord } from '#lib/db/schema';
import type { ResultShareInfo } from '#lib/api/resultShares';

const store = vi.hoisted(() => ({ records: new Map<string, unknown>() }));
vi.mock('#lib/repositories/reviewRepository', () => ({
  reviewRepository: {
    getBySubmission: vi.fn(async (_exam: string, sub: string) => store.records.get(sub) ?? null),
    save: vi.fn(async (_exam: string, rec: { submissionId: string }) => void store.records.set(rec.submissionId, rec)),
  },
}));
const reviews = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock('#lib/api/resultShares', () => ({ listExamReviews: vi.fn(async () => reviews.rows), openResultShare: vi.fn() }));

const { keepObjection, mergeReviewItems, saveReviewRecord } = await import('#lib/sharing/reviewRecord');
const { sealReviewPart } = await import('#lib/sharing/shareCrypto');

const item = (over: Partial<GradingReviewItem> = {}): GradingReviewItem => ({ key: 'ex-1', label: '1', objection: 'Too few', reply: '', pointsBefore: 3, pointsAfter: 4, ...over });
const record = (items: GradingReviewItem[], over: Partial<GradingReviewRecord> = {}): GradingReviewRecord => ({ id: 'r1', submissionId: 'sub-1', items, submittedAt: 't0', repliedAt: null, ...over });
const stored = () => store.records.get('sub-1') as GradingReviewRecord;

beforeEach(() => {
  store.records.clear();
  reviews.rows = [];
});

describe('mergeReviewItems', () => {
  it('keeps the first recorded pointsBefore and takes everything else from the new item', () => {
    const merged = mergeReviewItems([item({ pointsBefore: 3, pointsAfter: 4 })], [item({ pointsBefore: 4, pointsAfter: 4, reply: 'ok' })]);
    expect(merged).toEqual([item({ pointsBefore: 3, pointsAfter: 4, reply: 'ok' })]);
  });

  it('keeps a recorded pointsAfter when the new one is unknown', () => {
    expect(mergeReviewItems([item()], [item({ pointsBefore: null, pointsAfter: null })])[0]).toMatchObject({ pointsBefore: 3, pointsAfter: 4 });
  });

  it('passes new items through', () => {
    expect(mergeReviewItems([], [item({ pointsBefore: 2 })])[0].pointsBefore).toBe(2);
  });
});

describe('saveReviewRecord (issue #226: first write wins)', () => {
  it('a reply retry after the header changed keeps 3 -> 4', async () => {
    await saveReviewRecord('exam', record([item({ pointsBefore: 3, pointsAfter: 4 })], { repliedAt: 't1' }), null);
    await saveReviewRecord('exam', record([item({ pointsBefore: 4, pointsAfter: 4 })], { id: 'r2', repliedAt: 't2' }), null);
    expect(stored().items[0]).toMatchObject({ pointsBefore: 3, pointsAfter: 4 });
    expect(stored().id).toBe('r1');
  });
});

describe('keepObjection (issue #226)', () => {
  const contentKey = crypto.getRandomValues(new Uint8Array(32));
  const share = { id: 'share-1', studentKey: 'k1', reviewSubmittedAt: 't0', wrappedKey: new Uint8Array(1) } as ResultShareInfo;
  const opened = { contentKey, items: [{ key: 'ex-1', label: '1', max: 4, points: 3 }] };

  async function objectionRow(items: Record<string, string>) {
    const sealed = await sealReviewPart('share-1', contentKey, 'objection', { items });
    return { shareId: 'share-1', studentKey: 'k1', objection: sealed, submittedAt: 't0', openedAt: null, reply: null, repliedAt: null };
  }

  it('saves the objection with the points it was made against, unanswered', async () => {
    reviews.rows = [await objectionRow({ 'ex-1': 'Too few points' })];
    await keepObjection('exam', share, 'sub-1', null, opened);
    expect(stored()).toMatchObject({ repliedAt: null, submittedAt: 't0' });
    expect(stored().items).toEqual([{ key: 'ex-1', label: '1', objection: 'Too few points', reply: '', pointsBefore: 3, pointsAfter: 3 }]);
  });

  it('an update before the reply keeps 3 -> 4 once the reply comes', async () => {
    reviews.rows = [await objectionRow({ 'ex-1': 'Too few points' })];
    await keepObjection('exam', share, 'sub-1', null, opened);
    // The header now says 4; the reply is written against it.
    await saveReviewRecord('exam', record([item({ reply: 'Checked', pointsBefore: 4, pointsAfter: 4 })], { repliedAt: 't1' }), null);
    expect(stored().items[0]).toMatchObject({ reply: 'Checked', pointsBefore: 3, pointsAfter: 4 });
  });

  it('leaves an answered record alone', async () => {
    store.records.set('sub-1', record([item({ reply: 'Done' })], { repliedAt: 't1' }));
    reviews.rows = [await objectionRow({ 'ex-1': 'Again' })];
    await keepObjection('exam', share, 'sub-1', null, opened);
    expect(stored().items[0].objection).toBe('Too few');
  });

  it('does nothing for a share without an objection', async () => {
    await keepObjection('exam', { ...share, reviewSubmittedAt: null }, 'sub-1', null, opened);
    expect(store.records.size).toBe(0);
  });

  it('fails, and saves nothing, when the objection cannot be read', async () => {
    reviews.rows = [{ shareId: 'share-1', studentKey: 'k1', objection: { iv: new Uint8Array(12), ciphertext: new Uint8Array(32) }, submittedAt: 't0', openedAt: null, reply: null, repliedAt: null }];
    await expect(keepObjection('exam', share, 'sub-1', null, opened)).rejects.toThrow();
    expect(store.records.size).toBe(0);
  });

  it('drops keys and non-string texts the exam does not know', async () => {
    reviews.rows = [await objectionRow({ 'ex-1': 'Real', 'ghost': 'Not an item' })];
    await keepObjection('exam', share, 'sub-1', null, opened);
    expect(stored().items.map((i) => i.key)).toEqual(['ex-1']);
  });

});
