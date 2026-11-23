/** The compile cache's second level (issue #341): compiled PDFs and their aux files sealed in IndexedDB, so a reload neither compiles again nor loses the aux seeds. Best effort: a failure here only costs a compile, it never fails one. */

import { get } from 'svelte/store';
import { db } from '#lib/db/db';
import { openCompiledPdf, sealCompiledPdf } from '#lib/db/dbEncryption';
import { sessionStore } from '#lib/stores/session';
import type { AuxFile } from './compiler';

export interface StoredCompile {
  hash: string;
  pdfBytes: Uint8Array;
  missingGraphics: string[];
  engineUsed: 'local' | 'server';
  usedFallback: boolean;
  durationMs?: number;
  aux: AuxFile[];
}

type Meta = Omit<StoredCompile, 'pdfBytes' | 'aux'> & { pdfLength: number; aux: { path: string; length: number }[] };

const MAX_STORED_ENTRIES = 40;
const MAX_STORED_BYTES = 150 * 1024 * 1024;

const sessionKey = (): CryptoKey | null => (typeof window === 'undefined' ? null : get(sessionStore).sessionKey);
const available = (): boolean => typeof indexedDB !== 'undefined' && !!db.compiledPdfs;

/** Layout: 4-byte meta length, meta JSON, PDF, then the aux files in meta order. */
function encode(entry: StoredCompile): Uint8Array {
  const meta: Meta = {
    hash: entry.hash,
    missingGraphics: entry.missingGraphics,
    engineUsed: entry.engineUsed,
    usedFallback: entry.usedFallback,
    durationMs: entry.durationMs,
    pdfLength: entry.pdfBytes.length,
    aux: entry.aux.map((f) => ({ path: f.path, length: f.content.length })),
  };
  const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
  const parts = [metaBytes, entry.pdfBytes, ...entry.aux.map((f) => f.content)];
  const out = new Uint8Array(4 + parts.reduce((n, p) => n + p.length, 0));
  new DataView(out.buffer).setUint32(0, metaBytes.length);
  let offset = 4;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function decode(bytes: Uint8Array): StoredCompile {
  const metaLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  const meta = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + metaLength))) as Meta;
  let offset = 4 + metaLength;
  const take = (length: number) => {
    const part = bytes.slice(offset, offset + length);
    offset += length;
    return part;
  };
  const pdfBytes = take(meta.pdfLength);
  const aux = meta.aux.map((f) => ({ path: f.path, content: take(f.length) }));
  return { hash: meta.hash, missingGraphics: meta.missingGraphics, engineUsed: meta.engineUsed, usedFallback: meta.usedFallback, durationMs: meta.durationMs, pdfBytes, aux };
}

/** The stored compile of this slot, whatever its hash (callers compare it), or undefined. */
export async function loadStoredCompile(slotKey: string): Promise<StoredCompile | undefined> {
  const key = sessionKey();
  if (!key || !available()) return undefined;
  try {
    const row = await db.compiledPdfs.get(slotKey);
    if (!row) return undefined;
    const entry = decode(await openCompiledPdf(slotKey, row.ct, row.iv, key));
    void db.compiledPdfs.update(slotKey, { lastAccess: Date.now() }).catch(() => {});
    return entry;
  } catch (err) {
    // A row another account sealed, or a damaged one: drop it, the next compile writes a fresh one.
    console.info('[compileStore] dropping an unreadable compiled PDF:', err);
    void db.compiledPdfs.delete(slotKey).catch(() => {});
    return undefined;
  }
}

/** Seals and stores a compile, then evicts the least recently used rows over the budget. */
export async function saveStoredCompile(slotKey: string, entry: StoredCompile): Promise<void> {
  const key = sessionKey();
  if (!key || !available()) return;
  try {
    const { ct, iv } = await sealCompiledPdf(slotKey, encode(entry), key);
    await db.compiledPdfs.put({ slotKey, lastAccess: Date.now(), sizeBytes: ct.length, ct, iv });
    // Index keys only: the eviction pass never reads the stored PDFs.
    const newestFirst = db.compiledPdfs.orderBy('[lastAccess+sizeBytes]').reverse();
    const [stamps, slotKeys] = await Promise.all([newestFirst.keys(), newestFirst.primaryKeys()]);
    let total = 0;
    const evict = slotKeys.filter((_, index) => (total += Number((stamps[index] as unknown as [number, number])[1])) > MAX_STORED_BYTES || index >= MAX_STORED_ENTRIES);
    if (evict.length > 0) await db.compiledPdfs.bulkDelete(evict);
  } catch (err) {
    console.info('[compileStore] could not keep the compiled PDF:', err);
  }
}

/** Drops the stored rows whose slot key starts with *prefix* (one slot, one owner, or all with ''). */
export async function dropStoredCompiles(prefix: string): Promise<void> {
  if (!available()) return;
  try {
    if (prefix === '') await db.compiledPdfs.clear();
    else await db.compiledPdfs.where('slotKey').startsWith(prefix).delete();
  } catch (err) {
    console.info('[compileStore] could not drop compiled PDFs:', err);
  }
}
