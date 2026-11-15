import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get, writable } from 'svelte/store';

const mocks = vi.hoisted(() => ({
  openShareReview: vi.fn(),
  rows: [] as unknown[],
}));

vi.mock('#lib/api/resultShares', () => ({
  listResultShares: vi.fn(async () => [{ id: 's1', studentKey: 'k1', wrappedKey: new Uint8Array(1), expiresAt: '2099-01-01T00:00:00Z', updatable: true }]),
  listExamReviews: vi.fn(async () => mocks.rows),
  openShareReview: (...args: unknown[]) => mocks.openShareReview(...args),
  replyToShareReview: vi.fn(),
}));
vi.mock('#lib/crypto/pseudonymKey', () => ({ joinKey: vi.fn(async () => 'k1'), joinKeys: vi.fn(async (list: unknown[]) => list.map(() => 'k1')) }));
vi.mock('#lib/stores/session', () => ({ awaitSessionReady: vi.fn(async () => undefined), sessionStore: writable({ sessionKey: {} }) }));
vi.mock('#lib/repositories/studentRepository', () => ({ studentRepository: { getByExamId: vi.fn(async () => [{ email: 'a@b.c' }]) } }));
vi.mock('#lib/repositories/reviewRepository', () => ({ reviewRepository: { getBySubmission: vi.fn(async () => null) } }));
vi.mock('#lib/grading/omrTemplatePrep', () => ({ loadExamCompileContext: vi.fn(async () => ({ exercises: [{ id: 'ex-1', maxPoints: 4, orderIndex: 1 }], mcGroups: [] })) }));
vi.mock('#lib/sharing/shareService', () => ({ republishShare: vi.fn() }));
vi.mock('#lib/sharing/delivery', () => ({ mailReviewReply: vi.fn() }));
vi.mock('#lib/sharing/shareCrypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/sharing/shareCrypto')>()),
  unwrapShareKey: vi.fn(async () => ({ link: {}, contentKey: new Uint8Array(32) })),
  openReviewPart: vi.fn(async () => ({ items: { 'ex-1': 'Too few points', 'ghost': 'unknown item', 'ex-2': 7 } })),
}));

const { initReviews, showReview, resetReviews } = await import('#lib/sharing/reviewService');
const { reviewStore } = await import('#lib/grading/reviewStore');

const sub = { id: 'sub-1' } as never;
const unopened = () => [{ shareId: 's1', studentKey: 'k1', objection: { iv: new Uint8Array(12), ciphertext: new Uint8Array(1) }, submittedAt: 't0', openedAt: null, reply: null, repliedAt: null }];

beforeEach(() => {
  resetReviews();
  mocks.rows = unopened();
  mocks.openShareReview.mockReset();
});

describe('showReview (issue #226)', () => {
  it('locks the objection and offers the reply', async () => {
    mocks.openShareReview.mockResolvedValue(undefined);
    await initReviews('exam');
    await showReview('exam', sub);
    const state = get(reviewStore);
    expect(mocks.openShareReview).toHaveBeenCalledWith('exam', 's1');
    expect(state.thread?.openedAt).not.toBeNull();
    expect(state.lockFailed).toBe(false);
    expect(state.error).toBe('');
  });

  it('keeps only known items with string texts from the objection', async () => {
    mocks.openShareReview.mockResolvedValue(undefined);
    await initReviews('exam');
    await showReview('exam', sub);
    expect(get(reviewStore).thread?.objections).toEqual({ 'ex-1': 'Too few points' });
  });

  it('keeps the error and offers a retry instead of a reply when the opened call fails', async () => {
    mocks.openShareReview.mockRejectedValue(new Error('network down'));
    await initReviews('exam');
    await showReview('exam', sub);
    const state = get(reviewStore);
    expect(state.error).toBe('network down');
    expect(state.lockFailed).toBe(true);
    expect(state.thread?.openedAt).toBeNull();
    expect(state.thread?.objections['ex-1']).toBe('Too few points');
  });

  it('locks on the retry', async () => {
    mocks.openShareReview.mockRejectedValueOnce(new Error('network down')).mockResolvedValue(undefined);
    await initReviews('exam');
    await showReview('exam', sub);
    await showReview('exam', sub);
    expect(get(reviewStore).lockFailed).toBe(false);
    expect(get(reviewStore).thread?.openedAt).not.toBeNull();
  });
});
