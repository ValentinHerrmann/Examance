import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setArgon2Available } from './mocks/argon2Mock';
import type { ExamReviewInfo, ResultShareInfo } from '#lib/api/resultShares';
import { openReviewPart, openSealedShare, sealReviewPart, unwrapShareKey } from '#lib/sharing/shareCrypto';

const mocks = vi.hoisted(() => ({ session: null as unknown as import('svelte/store').Writable<{ masterKey: CryptoKey | null }>, created: [] as Record<string, unknown>[] }));
vi.mock('#lib/stores/session', async () => {
  const { writable: w } = await import('svelte/store');
  mocks.session = w({ masterKey: null });
  return { sessionStore: mocks.session, awaitSessionReady: async () => undefined };
});
vi.mock('#lib/api/resultShares', () => ({
  createResultShare: vi.fn(async (_examId: string, share: Record<string, unknown>) => {
    mocks.created.push(share);
  }),
}));

const { storeStudentShare, DEFAULT_EXPIRY_DAYS, expiryLimitDays, keptExpiryRange } = await import('#lib/sharing/shareService');
type Request = Parameters<typeof storeStudentShare>[0]['request'];

const PDF = new TextEncoder().encode('%PDF-1.4 graded');
const request = (over: Partial<Request> = {}): Request =>
  ({ examId: 'exam', channel: 'email', factor: 'code', expiryDays: 30, studentKeys: new Set(), includeSolution: false, language: 'de', includeCode: false, reviewUntil: null, reviewPrint: {}, ...over }) as Request;
const input = (old: ResultShareInfo | undefined, req: Request, code: string, threads = new Map<string, ExamReviewInfo>()) => ({
  request: req,
  studentKey: 'k1',
  old,
  code,
  header: { filename: 'x.pdf', examTitle: 'Exam' },
  items: () => [],
  docs: { graded: PDF },
  threads,
  name: 'Max',
  warnings: [] as string[],
});

/** The share the server would list for what the client stored. */
const listed = (share: Record<string, unknown>, expiresAt: string): ResultShareInfo =>
  ({ id: share.id, studentKey: 'k1', factor: share.factor, expiresAt, updatable: true, wrappedKey: share.wrappedKey, reviewSubmittedAt: 't0' }) as ResultShareInfo;

beforeAll(async () => {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  mocks.session.set({ masterKey: await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey', 'deriveBits']) });
});
beforeEach(() => {
  mocks.created = [];
  setArgon2Available(true);
});
afterEach(() => setArgon2Available(false));

describe('sending again keeps the link (issue #310)', () => {
  it('keeps the link and its thread across a factor and code change', async () => {
    const first = await storeStudentShare(input(undefined, request(), 'OLDCODE1'));
    const old = listed(mocks.created[0], '2026-12-24T00:00:00Z');
    const { contentKey: oldKey } = await unwrapShareKey(old.id, old.wrappedKey!);
    const objection = await sealReviewPart(old.id, oldKey, 'objection', { items: { 'ex-1': 'Too few points' } });
    const threads = new Map([[old.id, { shareId: old.id, studentKey: 'k1', objection, submittedAt: 't0', openedAt: null, reply: null, repliedAt: null }]]);

    const again = await storeStudentShare(input(old, request({ factor: 'sticker', expiryDays: 'keep' }), 'STICKERK', threads));
    expect(again?.link.shareId).toBe(first?.link.shareId);
    expect(again?.link.token).toEqual(first?.link.token);
    expect(again?.expiresAt.toISOString()).toBe('2026-12-24T00:00:00.000Z');
    const sent = mocks.created[1];
    expect(sent).toMatchObject({ id: old.id, lookupHash: mocks.created[0].lookupHash, factor: 'sticker', keepExpiry: true, expiryDays: DEFAULT_EXPIRY_DAYS });

    // The student opens the same link with the new factor, and reads the resealed objection.
    const opened = await openSealedShare(again!.link, 'sticker', 'STICKERK', sent.sealed as never);
    const resealed = (sent.review as { objection: { ciphertext: Uint8Array; iv: Uint8Array } }).objection;
    expect(await openReviewPart(old.id, opened.contentKey, 'objection', resealed.ciphertext, resealed.iv)).toEqual({ items: { 'ex-1': 'Too few points' } });
    await expect(openSealedShare(again!.link, 'code', 'OLDCODE1', sent.sealed as never)).rejects.toThrow();
  });

  it('gives a share made before updatable links a new link', async () => {
    const legacy = { id: crypto.randomUUID(), studentKey: 'k1', factor: 'none', expiresAt: '2026-12-24T00:00:00Z', updatable: false, wrappedKey: null } as unknown as ResultShareInfo;
    const stored = await storeStudentShare(input(legacy, request(), 'CODE2345'));
    expect(stored?.link.shareId).not.toBe(legacy.id);
    expect(mocks.created[0]).toMatchObject({ keepExpiry: false });
  });

  it('leaves the link alone when its thread cannot be read', async () => {
    await storeStudentShare(input(undefined, request(), 'OLDCODE1'));
    const old = listed(mocks.created[0], '2026-12-24T00:00:00Z');
    const broken = { iv: new Uint8Array(12), ciphertext: new Uint8Array(32) };
    const threads = new Map([[old.id, { shareId: old.id, studentKey: 'k1', objection: broken, submittedAt: 't0', openedAt: null, reply: null, repliedAt: null }]]);
    const job = input(old, request(), 'NEWCODE1', threads);
    expect(await storeStudentShare(job)).toBeNull();
    expect(mocks.created).toHaveLength(1);
    expect(job.warnings).toHaveLength(1);
    expect(job.warnings[0]).toMatch(/^Max: /);
  });

  // Review finding: a link that went out by e-mail with a code must not silently open without one.
  it('refuses protection "none" on a protected kept link unless the teacher confirmed it', async () => {
    await storeStudentShare(input(undefined, request(), 'OLDCODE1'));
    const old = listed(mocks.created[0], '2026-12-24T00:00:00Z');
    const refused = input(old, request({ factor: 'none', channel: 'slips' }), '');
    expect(await storeStudentShare({ ...refused, code: null })).toBeNull();
    expect(refused.warnings).toHaveLength(1);
    expect(mocks.created).toHaveLength(1);

    const confirmed = await storeStudentShare({ ...input(old, request({ factor: 'none', channel: 'slips', allowDowngrade: true }), ''), code: null });
    expect(confirmed?.link.shareId).toBe(old.id);
    expect(mocks.created[1]).toMatchObject({ id: old.id, factor: 'none' });
  });
});

describe('a thread changed during the send (issue #310 review)', () => {
  it('skips the student with a warning when the server reports a changed thread', async () => {
    const { ApiError } = await import('#lib/api/client');
    const { createResultShare } = await import('#lib/api/resultShares');
    await storeStudentShare(input(undefined, request(), 'OLDCODE1'));
    const old = listed(mocks.created[0], '2026-12-24T00:00:00Z');
    vi.mocked(createResultShare).mockRejectedValueOnce(new ApiError(409, 'ERR_SHARE_REVIEW_CHANGED', 'changed'));
    const job = input(old, request(), 'NEWCODE1');
    expect(await storeStudentShare(job)).toBeNull();
    expect(job.warnings).toHaveLength(1);
    // The client told the server which thread it saw: none.
    expect(vi.mocked(createResultShare).mock.calls.at(-1)?.[1]).toMatchObject({ review: { submittedAt: null, repliedAt: null } });
  });
});

describe('the expiry picker (issue #310 review)', () => {
  const now = Date.parse('2026-11-17T12:00:00Z');
  const student = (share?: Partial<ResultShareInfo>) => ({ share: share ? ({ updatable: true, wrappedKey: new Uint8Array(1), ...share } as ResultShareInfo) : undefined }) as never;

  it('counts only links a send keeps', () => {
    const legacy = student({ expiresAt: '2026-11-19T12:00:00Z', updatable: false, wrappedKey: null });
    expect(keptExpiryRange([legacy])).toBeNull();
    expect(keptExpiryRange([legacy, student({ expiresAt: '2026-12-24T00:00:00Z' })])?.first.toISOString()).toBe('2026-12-24T00:00:00.000Z');
  });

  it('limits objections by the shortest link of the send, a new link counting the default days', () => {
    expect(expiryLimitDays('keep', [student({ expiresAt: '2027-02-15T12:00:00Z' })], now)).toBe(90);
    expect(expiryLimitDays('keep', [student({ expiresAt: '2027-02-15T12:00:00Z' }), student()], now)).toBe(DEFAULT_EXPIRY_DAYS);
    expect(expiryLimitDays('keep', [student({ expiresAt: '2026-11-18T08:00:00Z' })], now)).toBe(0);
    expect(expiryLimitDays('14', [], now)).toBe(14);
  });
});
