import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get, writable } from 'svelte/store';

const mocks = vi.hoisted(() => ({
  openShareReview: vi.fn(),
  rows: [] as unknown[],
  factor: 'code',
  noShares: false,
  record: null as unknown,
}));

vi.mock('#lib/api/resultShares', () => ({
  listResultShares: vi.fn(async () => (mocks.noShares ? [] : [{ id: 's1', studentKey: 'k1', factor: mocks.factor, wrappedKey: new Uint8Array(1), expiresAt: '2099-01-01T00:00:00Z', updatable: true }])),
  listExamReviews: vi.fn(async () => mocks.rows),
  openShareReview: (...args: unknown[]) => mocks.openShareReview(...args),
  replyToShareReview: vi.fn(),
}));
vi.mock('#lib/crypto/pseudonymKey', () => ({ joinKey: vi.fn(async (sub: { id: string }) => (sub.id === 'sub-2' ? 'k2' : 'k1')), joinKeys: vi.fn(async (list: unknown[]) => list.map(() => 'k1')) }));
vi.mock('#lib/stores/session', () => ({ awaitSessionReady: vi.fn(async () => undefined), sessionStore: writable({ sessionKey: {} }) }));
vi.mock('#lib/repositories/studentRepository', () => ({ studentRepository: { getByExamId: vi.fn(async () => [{ email: 'a@b.c' }]) } }));
vi.mock('#lib/repositories/reviewRepository', () => ({ reviewRepository: { getBySubmission: vi.fn(async () => mocks.record) } }));
vi.mock('#lib/grading/omrTemplatePrep', () => ({ loadExamCompileContext: vi.fn(async () => ({ exercises: [{ id: 'ex-1', maxPoints: 4, orderIndex: 1 }], mcGroups: [] })) }));
vi.mock('#lib/sharing/shareService', () => ({ republishShare: vi.fn() }));
vi.mock('#lib/sharing/delivery', () => ({ mailReviewReply: vi.fn() }));
vi.mock('#lib/sharing/shareCrypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/sharing/shareCrypto')>()),
  unwrapShareKey: vi.fn(async () => ({ link: {}, contentKey: new Uint8Array(32) })),
  openReviewPart: vi.fn(async () => ({ items: { 'ex-1': 'Too few points', 'ghost': 'unknown item', 'ex-2': 7 } })),
}));

const { initReviews, showReview, resetReviews, sendReviewReply, resendReviewMail } = await import('#lib/sharing/reviewService');
const { reviewStore } = await import('#lib/grading/reviewStore');
const { republishShare } = await import('#lib/sharing/shareService');
const { mailReviewReply } = await import('#lib/sharing/delivery');

const sub = { id: 'sub-1' } as never;
const unopened = () => [{ shareId: 's1', studentKey: 'k1', objection: { iv: new Uint8Array(12), ciphertext: new Uint8Array(1) }, submittedAt: 't0', openedAt: null, reply: null, repliedAt: null }];

beforeEach(() => {
  resetReviews();
  mocks.rows = unopened();
  mocks.openShareReview.mockReset();
  mocks.factor = 'code';
  mocks.noShares = false;
  mocks.record = null;
  vi.mocked(republishShare).mockReset();
  vi.mocked(mailReviewReply).mockReset();
  vi.stubGlobal('location', { origin: 'https://examance.test' });
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

describe('sendReviewReply (issue #291)', () => {
  const published = { link: { shareId: 's1', token: new Uint8Array(16) }, contentKey: new Uint8Array(32), student: { email: 'a@b.c' }, examTitle: 'Exam', before: [], after: [] } as never;

  // Regression: a link without a second factor was mailed, so the server and the mail provider could open the graded exam.
  it('never mails a link that opens without a code', async () => {
    mocks.factor = 'none';
    mocks.openShareReview.mockResolvedValue(undefined);
    vi.mocked(republishShare).mockResolvedValue(published);
    await initReviews('exam');
    await showReview('exam', sub);
    expect(get(reviewStore)).toMatchObject({ canMail: false, mailBlocked: true });
    await sendReviewReply('exam', sub, async () => undefined);
    expect(mailReviewReply).not.toHaveBeenCalled();
    expect(get(reviewStore).sentAt).not.toBeNull();
  });

  // Regression: the outcome of A's reply was patched onto student B shown meanwhile.
  it('keeps the outcome on its own student when the teacher moves on', async () => {
    mocks.openShareReview.mockResolvedValue(undefined);
    let finish: (value: never) => void = () => undefined;
    vi.mocked(republishShare).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    vi.mocked(mailReviewReply).mockResolvedValue(false);
    await initReviews('exam');
    await showReview('exam', sub);
    expect(get(reviewStore).canMail).toBe(true);

    const sending = sendReviewReply('exam', sub, async () => undefined);
    await showReview('exam', { id: 'sub-2' } as never);
    finish(published);
    await sending;
    expect(mailReviewReply).toHaveBeenCalledOnce();
    expect(get(reviewStore)).toMatchObject({ thread: null, sentAt: null, mailFailed: false });

    await showReview('exam', sub);
    expect(get(reviewStore).mailFailed).toBe(true);
    expect(get(reviewStore).thread?.repliedAt).not.toBeNull();
  });

  it('resends only the shown student\'s failed mail', async () => {
    mocks.openShareReview.mockResolvedValue(undefined);
    vi.mocked(republishShare).mockResolvedValue(published);
    vi.mocked(mailReviewReply).mockResolvedValue(false);
    await initReviews('exam');
    await showReview('exam', sub);
    await sendReviewReply('exam', sub, async () => undefined);
    await showReview('exam', { id: 'sub-2' } as never);
    await resendReviewMail();
    expect(mailReviewReply).toHaveBeenCalledOnce();
    await showReview('exam', sub);
    await resendReviewMail();
    expect(mailReviewReply).toHaveBeenCalledTimes(2);
    expect(vi.mocked(mailReviewReply).mock.calls[1][2]).toBe('k1');
  });

  it('never puts an error of A onto B', async () => {
    mocks.openShareReview.mockResolvedValue(undefined);
    let fail: (err: Error) => void = () => undefined;
    vi.mocked(republishShare).mockReturnValue(new Promise((_, reject) => (fail = reject)));
    await initReviews('exam');
    await showReview('exam', sub);
    const sending = sendReviewReply('exam', sub, async () => undefined);
    await showReview('exam', { id: 'sub-2' } as never);
    fail(new Error('offline'));
    await sending;
    expect(get(reviewStore).error).toBe('');
  });

  it('a newer reply without mail replaces an older failed mail', async () => {
    mocks.openShareReview.mockResolvedValue(undefined);
    vi.mocked(republishShare).mockResolvedValue(published);
    vi.mocked(mailReviewReply).mockResolvedValue(false);
    await initReviews('exam');
    await showReview('exam', sub);
    await sendReviewReply('exam', sub, async () => undefined);
    expect(get(reviewStore).mailFailed).toBe(true);
    reviewStore.patch({ notify: false });
    await sendReviewReply('exam', sub, async () => undefined);
    await showReview('exam', sub);
    expect(get(reviewStore).mailFailed).toBe(false);
  });

  it('ignores a second send while the first still runs, also after switching back', async () => {
    mocks.openShareReview.mockResolvedValue(undefined);
    let finish: (value: never) => void = () => undefined;
    vi.mocked(republishShare).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await initReviews('exam');
    await showReview('exam', sub);
    const first = sendReviewReply('exam', sub, async () => undefined);
    await showReview('exam', { id: 'sub-2' } as never);
    await showReview('exam', sub);
    expect(get(reviewStore).sending).toBe(true);
    await sendReviewReply('exam', sub, async () => undefined);
    finish(published);
    await first;
    expect(republishShare).toHaveBeenCalledOnce();
    expect(get(reviewStore)).toMatchObject({ sending: false });
    expect(get(reviewStore).sentAt).not.toBeNull();
  });

  it('offers no mail for a kept objection without a current link', async () => {
    mocks.noShares = true;
    mocks.rows = [];
    mocks.record = { id: 'r', submissionId: 'sub-1', items: [{ key: 'ex-1', label: '1', objection: 'Too few', reply: '', pointsBefore: null, pointsAfter: null }], submittedAt: 't0', repliedAt: null };
    await initReviews('exam');
    await showReview('exam', sub);
    expect(get(reviewStore)).toMatchObject({ canMail: false, mailBlocked: false });
    expect(get(reviewStore).thread?.fromRecord).toBe(true);
  });
});
