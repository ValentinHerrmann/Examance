import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { setArgon2Available } from './mocks/argon2Mock';
import {
  lookupSecret,
  newShareLink,
  openReviewPart,
  openSealedShare,
  REVIEW_TEXT_MAX,
  resealShare,
  sanitizeObjection,
  sanitizeReply,
  sealReviewPart,
  sealShare,
  unwrapShareKey,
  wrapShareKey,
} from '#lib/sharing/shareCrypto';
import { buildReviewItems, reviewDateValid, reviewDeadline } from '#lib/sharing/reviewItems';
import type { ExerciseRecord } from '#lib/db/schema';

const mocks = vi.hoisted(() => ({ session: null as unknown as import('svelte/store').Writable<{ masterKey: CryptoKey | null }> }));
vi.mock('#lib/stores/session', async () => {
  const { writable: w } = await import('svelte/store');
  mocks.session = w({ masterKey: null });
  return { sessionStore: mocks.session };
});

const PDF = new TextEncoder().encode('%PDF-1.4 graded');
const NEW_PDF = new TextEncoder().encode('%PDF-1.4 regraded');
const HEADER = { filename: 'exam_x.pdf', examTitle: 'Exam' };

afterEach(() => setArgon2Available(false));

beforeAll(async () => {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const masterKey = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey', 'deriveBits']);
  mocks.session.set({ masterKey });
});

describe('wrapped share keys (issue #226)', () => {
  it('round-trips the token and content key for the owning account', async () => {
    expect(get(mocks.session).masterKey).not.toBeNull();
    const link = newShareLink();
    const sealed = await sealShare(link, 'none', null, HEADER, { graded: PDF });
    const wrapped = await wrapShareKey(link, sealed.contentKey);
    const back = await unwrapShareKey(link.shareId, wrapped);
    expect(back.link.token).toEqual(link.token);
    expect(back.contentKey).toEqual(sealed.contentKey);
  });

  it('refuses to unwrap under another share id', async () => {
    const link = newShareLink();
    const sealed = await sealShare(link, 'none', null, HEADER, { graded: PDF });
    const wrapped = await wrapShareKey(link, sealed.contentKey);
    await expect(unwrapShareKey(newShareLink().shareId, wrapped)).rejects.toThrow();
  });

  it('keeps the link openable after a reseal', async () => {
    const link = newShareLink();
    const sealed = await sealShare(link, 'none', null, HEADER, { graded: PDF });
    const again = await resealShare(link.shareId, sealed.contentKey, { ...HEADER, items: [{ key: 'a', label: '1', max: 4, points: 3 }] }, { graded: NEW_PDF });
    const opened = await openSealedShare(link, 'none', null, { ...again, kdfSalt: null });
    expect(opened.documents.graded).toEqual(NEW_PDF);
    expect(opened.header.items?.[0].points).toBe(3);
    expect(opened.contentKey).toEqual(sealed.contentKey);
    // The lookup the server stored stays valid: it never depends on the content.
    expect(await lookupSecret(link)).toEqual(await lookupSecret(link));
  });
});

describe('objections and replies (issue #226)', () => {
  it('seals an objection that only the same content key opens', async () => {
    const link = newShareLink();
    const { contentKey } = await sealShare(link, 'none', null, HEADER, { graded: PDF });
    const sealed = await sealReviewPart(link.shareId, contentKey, 'objection', { items: { a: 'Why only 3?' } });
    expect((await openReviewPart(link.shareId, contentKey, 'objection', sealed.ciphertext, sealed.iv)).items.a).toBe('Why only 3?');
    const wrong = crypto.getRandomValues(new Uint8Array(32));
    await expect(openReviewPart(link.shareId, wrong, 'objection', sealed.ciphertext, sealed.iv)).rejects.toThrow();
    // An objection cannot be passed off as a reply.
    await expect(openReviewPart(link.shareId, contentKey, 'reply', sealed.ciphertext, sealed.iv)).rejects.toThrow();
  });

  it('enforces the text limit on both parts', async () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const id = newShareLink().shareId;
    const ok = 'x'.repeat(REVIEW_TEXT_MAX);
    await expect(sealReviewPart(id, key, 'objection', { items: { a: ok } })).resolves.toBeDefined();
    await expect(sealReviewPart(id, key, 'objection', { items: { a: ok + 'x' } })).rejects.toThrow();
    await expect(sealReviewPart(id, key, 'reply', { items: { a: { text: ok + 'x', pointsBefore: 1, pointsAfter: 2 } } })).rejects.toThrow();
  });
});

describe('review items and deadline', () => {
  const ex = (id: string, orderIndex: number, maxPoints: number, extra: Partial<ExerciseRecord> = {}) => ({ id, orderIndex, maxPoints, ...extra }) as ExerciseRecord;

  it('lists exercises with their points and skips ungraded ones', () => {
    const items = buildReviewItems([ex('e1', 1, 4), ex('e2', 2, 0), ex('m1', 3, 1), ex('m2', 3, 1)], [{ memberIds: ['m1', 'm2'] }], [{ exerciseId: 'e1', score: 3 }]);
    expect(items.map((i) => [i.key, i.label, i.max, i.points])).toEqual([
      ['e1', '1', 4, 3],
      ['m1', '3a', 1, null],
      ['m2', '3b', 1, null],
    ]);
  });

  it('caps the deadline at the link expiry', () => {
    const now = new Date(2026, 0, 1, 12);
    const far = reviewDeadline('2030-01-01', 7, now);
    expect(far && far.getTime() < now.getTime() + 7 * 86_400_000).toBe(true);
    expect(reviewDeadline('2025-01-01', 7, now)).toBeNull();
    expect(reviewDateValid('2026-01-05', 7, now)).toBe(true);
    expect(reviewDateValid('2026-03-05', 7, now)).toBe(false);
  });
});

describe('sanitizing student-controlled payloads (issue #226)', () => {
  const keys = ['ex-1', 'ex-2#a'];

  it('keeps known keys with string texts only', () => {
    expect(sanitizeObjection({ items: { 'ex-1': 'ok', 'ex-2#a': 7, 'ex-9': 'unknown key' } }, keys)).toEqual({ items: { 'ex-1': 'ok' } });
  });

  it('cuts an oversized text to the limit', () => {
    const out = sanitizeObjection({ items: { 'ex-1': 'x'.repeat(REVIEW_TEXT_MAX + 50) } }, keys);
    expect(out.items['ex-1']).toHaveLength(REVIEW_TEXT_MAX);
  });

  it.each([null, undefined, 'text', 42, [], { items: null }, { items: ['a'] }])('reads %j as empty', (payload) => {
    expect(sanitizeObjection(payload, keys)).toEqual({ items: {} });
    expect(sanitizeReply(payload, keys)).toEqual({ items: {} });
  });

  it('keeps a reply text as a string and points as a number or null', () => {
    const out = sanitizeReply({ items: { 'ex-1': { text: 'Fixed', pointsBefore: 3, pointsAfter: '4' }, 'ex-2#a': { text: 5, pointsBefore: null, pointsAfter: 1 }, 'ex-9': { text: 'x' }, 'ex-3': 'no' } }, keys);
    expect(out.items).toEqual({
      'ex-1': { text: 'Fixed', pointsBefore: 3, pointsAfter: null },
      'ex-2#a': { text: '', pointsBefore: null, pointsAfter: 1 },
    });
  });
});
