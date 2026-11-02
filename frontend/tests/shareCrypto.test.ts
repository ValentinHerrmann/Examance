import { afterEach, describe, expect, it } from 'vitest';
import { setArgon2Available } from './mocks/argon2Mock';
import { encrypt, toArrayBuffer } from '#lib/crypto/aesGcm';
import {
  formatCode,
  lookupHash,
  lookupSecret,
  newShareLink,
  normalizeCode,
  openSealedShare,
  parseShareFragment,
  sealShare,
  shareUrl,
} from '#lib/sharing/shareCrypto';

const PDF = new TextEncoder().encode('%PDF-1.4 graded');
const HEADER = { filename: 'exam_doe-jane.pdf', examTitle: 'Exam' };

afterEach(() => setArgon2Available(false));

describe('result share links (issue #207)', () => {
  it('round-trips the link through the URL fragment', () => {
    const link = newShareLink();
    const url = shareUrl('https://app.example', link);
    expect(url.startsWith('https://app.example/result#')).toBe(true);
    const parsed = parseShareFragment(new URL(url).hash);
    expect(parsed?.shareId).toBe(link.shareId);
    expect(parsed?.token).toEqual(link.token);
  });

  it('rejects incomplete fragments', () => {
    const link = newShareLink();
    expect(parseShareFragment(`#${link.shareId}`)).toBeNull();
    expect(parseShareFragment('#not-a-uuid.AAAA')).toBeNull();
    expect(parseShareFragment(`#${link.shareId}.AAAA`)).toBeNull();
  });

  it('derives a lookup the server can only compare, not reverse', async () => {
    const link = newShareLink();
    const secret = await lookupSecret(link);
    expect(secret).toHaveLength(32);
    expect(await lookupHash(secret)).toMatch(/^[0-9a-f]{64}$/);
    expect(await lookupSecret(link)).toEqual(secret);
  });

  it('opens a link-only share with the link alone', async () => {
    const link = newShareLink();
    const sealed = await sealShare(link, 'none', null, HEADER, { graded: PDF });
    expect(sealed.kdfSalt).toBeNull();
    const opened = await openSealedShare(link, 'none', null, sealed);
    expect(opened.header).toEqual(HEADER);
    expect(opened.documents.graded).toEqual(PDF);
  });

  it('needs the code for a protected share and accepts it typed loosely', async () => {
    setArgon2Available(true);
    const link = newShareLink();
    const sealed = await sealShare(link, 'code', 'ABCDEFGH', HEADER, { graded: PDF });
    expect(sealed.kdfSalt).toHaveLength(16);
    await expect(openSealedShare(link, 'code', 'ABCDEFGX', sealed)).rejects.toThrow();
    const opened = await openSealedShare(link, 'code', 'abcd-efgh', sealed);
    expect(opened.documents.graded).toEqual(PDF);
  });

  it('binds the ciphertext to its share id', async () => {
    const link = newShareLink();
    const sealed = await sealShare(link, 'none', null, HEADER, { graded: PDF });
    await expect(openSealedShare({ ...link, shareId: crypto.randomUUID() }, 'none', null, sealed)).rejects.toThrow();
  });

  it('carries the sample solution next to the graded exam', async () => {
    const link = newShareLink();
    const solution = new TextEncoder().encode('%PDF-1.4 solution');
    const sealed = await sealShare(link, 'none', null, HEADER, { graded: PDF, solution });
    const { header, documents } = await openSealedShare(link, 'none', null, sealed);
    expect(header).toEqual(HEADER);
    expect(documents.graded).toEqual(PDF);
    expect(documents.solution).toEqual(solution);
  });

  it('still opens a v1 payload (one PDF, no document list)', async () => {
    const link = newShareLink();
    // Seal a v1 plaintext by hand with the link-only key the current code derives.
    const probe = await sealShare(link, 'none', null, HEADER, { graded: PDF });
    const head = new TextEncoder().encode(JSON.stringify(HEADER));
    const plain = new Uint8Array(4 + head.length + PDF.length);
    new DataView(plain.buffer).setUint32(0, head.length);
    plain.set(head, 4);
    plain.set(PDF, 4 + head.length);
    const raw = await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode(link.shareId), info: new TextEncoder().encode('examance-share-key:v1:none') },
      await crypto.subtle.importKey('raw', toArrayBuffer(link.token), 'HKDF', false, ['deriveBits']),
      256
    );
    const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
    const { ciphertext, iv } = await encrypt(key, plain, undefined, new TextEncoder().encode(`share:v1:${link.shareId}`));
    const opened = await openSealedShare(link, 'none', null, { ...probe, ciphertext, iv });
    expect(opened.header).toEqual(HEADER);
    expect(opened.documents.graded).toEqual(PDF);
    expect(opened.documents.solution).toBeUndefined();
  });

  it('formats and normalizes codes', () => {
    expect(formatCode('abcdefgh')).toBe('ABCD-EFGH');
    expect(normalizeCode(' abcd - efgh ')).toBe('ABCDEFGH');
  });
});
