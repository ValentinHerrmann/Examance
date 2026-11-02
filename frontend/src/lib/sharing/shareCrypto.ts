/** Result shares (issue #207, docs/dev/result_sharing.md). The link fragment `#<shareId>.<token>` never reaches the server; the server stores `sha256(lookup)` and ciphertext only. Content key: HKDF(token [‖ Argon2id(code, salt)], salt = shareId, info = factor). */

import { deriveArgon2Key } from '#lib/crypto/keyDerivation';
import { decrypt, encrypt, fromBase64url, toArrayBuffer, toBase64url } from '#lib/crypto/aesGcm';

export type ShareFactor = 'none' | 'sticker' | 'code';

export interface ShareLink {
  shareId: string;
  /** 16 random bytes: the real secret of the link. */
  token: Uint8Array;
}

export interface ShareHeader {
  filename: string;
  examTitle: string;
}

export interface SealedShare {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  kdfSalt: Uint8Array | null;
}

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

async function contentKey(link: ShareLink, factor: ShareFactor, code: string | null, salt: Uint8Array | null): Promise<CryptoKey> {
  let ikm = link.token;
  if (factor !== 'none') {
    if (!code || !salt) throw new Error('A code is required for this share.');
    // Argon2id makes guessing the short code offline costly even for someone holding the link.
    const { rawKey } = await deriveArgon2Key(normalizeCode(code), salt);
    ikm = new Uint8Array([...link.token, ...rawKey]);
  }
  const raw = await hkdf(ikm, link.shareId, `examance-share-key:v1:${factor}`);
  return crypto.subtle.importKey('raw', toArrayBuffer(raw), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

const aad = (link: ShareLink) => encoder.encode(`share:v1:${link.shareId}`);

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
): Promise<SealedShare> {
  const kdfSalt = factor === 'none' ? null : crypto.getRandomValues(new Uint8Array(16));
  const key = await contentKey(link, factor, code, kdfSalt);
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
  const { ciphertext, iv } = await encrypt(key, plain, undefined, aad(link));
  return { ciphertext, iv, kdfSalt };
}

/** Opens a share in the student's browser; throws on a wrong code (GCM authentication fails). Reads v1 payloads (one PDF) too. */
export async function openSealedShare(
  link: ShareLink,
  factor: ShareFactor,
  code: string | null,
  sealed: SealedShare
): Promise<{ header: ShareHeader; documents: ShareDocuments }> {
  const key = await contentKey(link, factor, code, sealed.kdfSalt);
  const plain = await decrypt(key, sealed.ciphertext, sealed.iv, null, aad(link));
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
