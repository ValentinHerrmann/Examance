/** Result shares (issue #207, docs/dev/result_sharing.md). The link fragment `#<shareId>.<token>` never reaches the server; the server stores `sha256(lookup)` and ciphertext only. Content key: HKDF(token [‖ Argon2id(code, salt)], salt = shareId, info = factor). */

import { deriveArgon2Key } from '#lib/crypto/keyDerivation';
import { decrypt, encrypt, fromBase64url, toArrayBuffer, toBase64url } from '#lib/crypto/aesGcm';
import { get } from 'svelte/store';
import { sessionStore } from '#lib/stores/session';
import { MissingSessionKeyError } from '#lib/db/decryptGuard';

export type ShareFactor = 'none' | 'sticker' | 'code';

export interface ShareLink {
  shareId: string;
  /** 16 random bytes: the real secret of the link. */
  token: Uint8Array;
}

/** One gradable (sub)exercise of a v3 header (issue #226): `key` is the exercise id or `${exerciseId}#${part}`. */
export interface ReviewItem {
  key: string;
  label: string;
  max: number;
  points: number | null;
}

export interface ShareHeader {
  filename: string;
  examTitle: string;
  /** v3: the items a student can object to; absent on older shares, which then show no form. */
  items?: ReviewItem[];
}

export interface SealedShare {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  kdfSalt: Uint8Array | null;
}

/** A sealed share plus its raw content key, which the teacher keeps wrapped (`wrapShareKey`) and the student needs for objections. */
export interface SealedShareWithKey extends SealedShare {
  contentKey: Uint8Array;
}

/** Hard limit per objection and per reply field, on both sides (issue #226). */
export const REVIEW_TEXT_MAX = 500;

/** The public page that opens a share (a public path: `navigationStore.isPublicPath`). */
export const SHARE_PATH = '/result';
const TOKEN_BYTES = 16;
const encoder = new TextEncoder();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function newShareLink(): ShareLink {
  return { shareId: crypto.randomUUID(), token: crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)) };
}

export function shareUrl(origin: string, link: ShareLink): string {
  return `${origin}${SHARE_PATH}#${link.shareId}.${toBase64url(link.token)}`;
}

/** The link from a `location.hash`, or null when it is not one. */
export function parseShareFragment(hash: string): ShareLink | null {
  const [shareId, tokenPart] = hash.replace(/^#/, '').split('.');
  if (!shareId || !tokenPart || !UUID.test(shareId)) return null;
  try {
    const token = fromBase64url(tokenPart);
    return token.length === TOKEN_BYTES ? { shareId: shareId.toLowerCase(), token } : null;
  } catch {
    return null;
  }
}

/** Upper case, letters and digits only: what the student types may carry spaces, dashes or lower case. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** `ABCD-EFGH`, for printing. */
export function formatCode(code: string): string {
  return normalizeCode(code).replace(/(.{4})(?=.)/g, '$1-');
}

async function hkdf(ikm: Uint8Array, shareId: string, info: string): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey('raw', toArrayBuffer(ikm), 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(shareId), info: encoder.encode(info) },
    base,
    256
  );
  return new Uint8Array(bits);
}

/** The secret the student sends to fetch the ciphertext; the server keeps only its hash. */
export function lookupSecret(link: ShareLink): Promise<Uint8Array> {
  return hkdf(link.token, link.shareId, 'examance-share-lookup:v1');
}

export async function lookupHash(secret: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(secret));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function contentKeyBits(link: ShareLink, factor: ShareFactor, code: string | null, salt: Uint8Array | null): Promise<Uint8Array> {
  let ikm = link.token;
  if (factor !== 'none') {
    if (!code || !salt) throw new Error('A code is required for this share.');
    // Argon2id makes guessing the short code offline costly even for someone holding the link.
    const { rawKey } = await deriveArgon2Key(normalizeCode(code), salt);
    ikm = new Uint8Array([...link.token, ...rawKey]);
  }
  return hkdf(ikm, link.shareId, `examance-share-key:v1:${factor}`);
}

const aesKey = (raw: Uint8Array) => crypto.subtle.importKey('raw', toArrayBuffer(raw), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);

const aad = (shareId: string) => encoder.encode(`share:v1:${shareId}`);

export type ShareDocumentKind = 'graded' | 'solution';

export interface ShareDocuments {
  graded: Uint8Array;
  solution?: Uint8Array;
}

interface StoredHeader extends ShareHeader {
  /** v2: the documents after the header, in order; absent (v1) means one graded PDF. */
  documents?: { kind: ShareDocumentKind; length: number }[];
}

/** `[u32 header length][header JSON][documents…]`, sealed with AES-256-GCM bound to the share id. */
export async function sealShare(
  link: ShareLink,
  factor: ShareFactor,
  code: string | null,
  header: ShareHeader,
  docs: ShareDocuments
): Promise<SealedShareWithKey> {
  const kdfSalt = factor === 'none' ? null : crypto.getRandomValues(new Uint8Array(16));
  const contentKey = await contentKeyBits(link, factor, code, kdfSalt);
  const { ciphertext, iv } = await sealPayload(link.shareId, contentKey, header, docs);
  return { ciphertext, iv, kdfSalt, contentKey };
}

/** Re-seals new content under the same link and key (issue #226): lookup, factor and salt stay, so the student's link keeps working. */
export function resealShare(shareId: string, contentKey: Uint8Array, header: ShareHeader, docs: ShareDocuments): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  return sealPayload(shareId, contentKey, header, docs);
}

async function sealPayload(shareId: string, contentKey: Uint8Array, header: ShareHeader, docs: ShareDocuments): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const key = await aesKey(contentKey);
  const parts: [ShareDocumentKind, Uint8Array][] = [['graded', docs.graded]];
  if (docs.solution) parts.push(['solution', docs.solution]);
  const stored: StoredHeader = { ...header, documents: parts.map(([kind, bytes]) => ({ kind, length: bytes.length })) };
  const head = encoder.encode(JSON.stringify(stored));
  const plain = new Uint8Array(4 + head.length + parts.reduce((n, [, b]) => n + b.length, 0));
  new DataView(plain.buffer).setUint32(0, head.length);
  plain.set(head, 4);
  let offset = 4 + head.length;
  for (const [, bytes] of parts) {
    plain.set(bytes, offset);
    offset += bytes.length;
  }
  return encrypt(key, plain, undefined, aad(shareId));
}

/** Opens a share in the student's browser; throws on a wrong code (GCM authentication fails). Reads v1 payloads (one PDF) too. */
export async function openSealedShare(
  link: ShareLink,
  factor: ShareFactor,
  code: string | null,
  sealed: SealedShare
): Promise<{ header: ShareHeader; documents: ShareDocuments; contentKey: Uint8Array }> {
  const contentKey = await contentKeyBits(link, factor, code, sealed.kdfSalt);
  return { ...(await openWithKey(link.shareId, contentKey, sealed)), contentKey };
}

/** Opens a share with its raw content key (the teacher's unwrapped copy), so a republish can carry the sample solution over without the student's code. */
export async function openWithKey(
  shareId: string,
  contentKey: Uint8Array,
  sealed: Pick<SealedShare, 'ciphertext' | 'iv'>
): Promise<{ header: ShareHeader; documents: ShareDocuments }> {
  const plain = await decrypt(await aesKey(contentKey), sealed.ciphertext, sealed.iv, null, aad(shareId));
  const headLength = new DataView(plain.buffer, plain.byteOffset, plain.byteLength).getUint32(0);
  const { documents: layout, ...header } = JSON.parse(new TextDecoder().decode(plain.subarray(4, 4 + headLength))) as StoredHeader;
  let offset = 4 + headLength;
  if (!layout) return { header, documents: { graded: plain.slice(offset) } };
  const found: Partial<ShareDocuments> = {};
  for (const { kind, length } of layout) {
    found[kind] = plain.slice(offset, offset + length);
    offset += length;
  }
  if (!found.graded) throw new Error('Share holds no graded PDF.');
  return { header, documents: { graded: found.graded, solution: found.solution } };
}

const wrapCache = new WeakMap<CryptoKey, Promise<CryptoKey>>();

/** `K_wrap = HKDF(data key, "examance-share-wrap-v1", "share-wrap")`: only this account can unwrap a share's token and content key. */
function shareWrapKey(): Promise<CryptoKey> {
  const master = get(sessionStore).masterKey;
  if (!master) throw new MissingSessionKeyError('share-wrap');
  let key = wrapCache.get(master);
  if (!key) {
    key = crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('examance-share-wrap-v1'), info: encoder.encode('share-wrap') },
      master,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    key.catch(() => wrapCache.delete(master));
    wrapCache.set(master, key);
  }
  return key;
}

const wrapAad = (shareId: string) => encoder.encode(`share-wrap:v1:${shareId}`);
const CONTENT_KEY_BYTES = 32;

/** `iv(12) ‖ AES-GCM(K_wrap, token ‖ contentKey)`, stored on the share row so the teacher can update it in place and read objections. */
export async function wrapShareKey(link: ShareLink, contentKey: Uint8Array): Promise<Uint8Array> {
  const { ciphertext, iv } = await encrypt(await shareWrapKey(), new Uint8Array([...link.token, ...contentKey]), undefined, wrapAad(link.shareId));
  return new Uint8Array([...iv, ...ciphertext]);
}

export async function unwrapShareKey(shareId: string, wrapped: Uint8Array): Promise<{ link: ShareLink; contentKey: Uint8Array }> {
  const plain = await decrypt(await shareWrapKey(), wrapped.subarray(12), wrapped.subarray(0, 12), null, wrapAad(shareId));
  if (plain.length !== TOKEN_BYTES + CONTENT_KEY_BYTES) throw new Error('Wrapped share key has the wrong length.');
  return { link: { shareId, token: plain.slice(0, TOKEN_BYTES) }, contentKey: plain.slice(TOKEN_BYTES) };
}

/** Objection text per item key, written by the student. */
export interface ObjectionPayload {
  items: Record<string, string>;
}

/** Reply per item key, written by the teacher. */
export interface ReplyPayload {
  items: Record<string, { text: string; pointsBefore: number | null; pointsAfter: number | null }>;
}

type ReviewPart = 'objection' | 'reply';

/** `K_review = HKDF(contentKey, salt shareId, "examance-share-review:v1")`: needs the code too, so a link carrier cannot read or forge objections. */
async function reviewKey(shareId: string, contentKey: Uint8Array): Promise<CryptoKey> {
  return aesKey(await hkdf(contentKey, shareId, 'examance-share-review:v1'));
}

const reviewAad = (shareId: string, part: ReviewPart) => encoder.encode(`review:v1:${shareId}:${part}`);

function clampTexts<T>(items: Record<string, T>, text: (v: T) => string): void {
  for (const value of Object.values(items)) if (text(value).length > REVIEW_TEXT_MAX) throw new Error(`A review text is longer than ${REVIEW_TEXT_MAX} characters.`);
}

export async function sealReviewPart(shareId: string, contentKey: Uint8Array, part: 'objection', payload: ObjectionPayload): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }>;
export async function sealReviewPart(shareId: string, contentKey: Uint8Array, part: 'reply', payload: ReplyPayload): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }>;
export async function sealReviewPart(shareId: string, contentKey: Uint8Array, part: ReviewPart, payload: ObjectionPayload | ReplyPayload) {
  if (part === 'objection') clampTexts((payload as ObjectionPayload).items, (v) => v);
  else clampTexts((payload as ReplyPayload).items, (v) => v.text);
  return encrypt(await reviewKey(shareId, contentKey), encoder.encode(JSON.stringify(payload)), undefined, reviewAad(shareId, part));
}

export async function openReviewPart(shareId: string, contentKey: Uint8Array, part: 'objection', ciphertext: Uint8Array, iv: Uint8Array): Promise<ObjectionPayload>;
export async function openReviewPart(shareId: string, contentKey: Uint8Array, part: 'reply', ciphertext: Uint8Array, iv: Uint8Array): Promise<ReplyPayload>;
export async function openReviewPart(shareId: string, contentKey: Uint8Array, part: ReviewPart, ciphertext: Uint8Array, iv: Uint8Array) {
  const plain = await decrypt(await reviewKey(shareId, contentKey), ciphertext, iv, null, reviewAad(shareId, part));
  return JSON.parse(new TextDecoder().decode(plain)) as ObjectionPayload | ReplyPayload;
}
