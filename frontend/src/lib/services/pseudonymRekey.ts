/** Keyed pseudonyms (issue #177, docs/dev/pseudonym_hmac_and_aad.md): which version a new row is written at, and the post-unlock re-key that moves version-1 rows to the keyed HMAC where results live. Idempotent per exam; rows that do not open are never rewritten; a failed exam stays at version 1, which keeps working. */

import { get } from 'svelte/store';
import { api, ApiError } from '#lib/api/client';
import { db } from '#lib/db/db';
import { decryptStudent, encryptStudent } from '#lib/db/dbEncryption';
import type { PseudonymVersion, StudentRecord } from '#lib/db/schema';
import { keyFromRaw, pseudonymBase, serverVersion } from '#lib/crypto/pseudonymKey';
import { resultsAreLocal } from '#lib/stores/storagePolicy';
import { sessionStore } from '#lib/stores/session';
import { flushOfflineQueue, offlineQueue, rewriteQueued, withQueueHeld } from '#lib/services/offlineQueue';
import { safeLocalStorage } from '#lib/utils/storage';

/** Taken by the re-key and by the results mover, so they never interleave. */
export const REKEY_LOCK = 'examance-pseudonym-rekey';
/** Written when this tab re-keyed something; other tabs reload (`stores/workspaceSync.ts`) instead of saving records read before. */
export const REKEYED_KEY = 'bg_pseudonyms_rekeyed';

/** Server exams' versions this tab has seen. */
const serverVersions = new Map<string, PseudonymVersion>();

export function rememberServerVersion(examId: string, version: PseudonymVersion): void {
  serverVersions.set(examId.toLowerCase(), version);
}

interface PseudonymList {
  pseudonym_version: number;
  values: string[];
}

/** The version a new row of this exam is written at: always keyed in this browser; on the server the exam's own (one the re-key could not move stays at 1 until it can). */
export async function writeVersion(examId: string): Promise<PseudonymVersion> {
  if (resultsAreLocal()) return 2;
  const known = serverVersions.get(examId.toLowerCase());
  if (known) return known;
  const list = await api.get<PseudonymList>(`/exams/${examId}/pseudonyms`, { silentError: true });
  const version = serverVersion(list);
  rememberServerVersion(examId, version);
  return version;
}

/** The pseudonym fields of a new row for a fresh raw value (a QR code, a minted id). */
export async function pseudonymFor(
  examId: string,
  raw: string
): Promise<Pick<StudentRecord, 'pseudonymHmac' | 'pseudonymVersion' | 'pseudonymRaw' | 'pseudonymBase'>> {
  const version = await writeVersion(examId);
  const base = await pseudonymBase(raw);
  return {
    // Version 1 is stored the way the server holds it: the SHA-256 form.
    pseudonymHmac: version === 2 ? await keyFromRaw(examId, raw) : base,
    pseudonymVersion: version,
    pseudonymRaw: raw,
    pseudonymBase: base,
  };
}

async function withRekeyLock<T>(op: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) return op();
  return navigator.locks.request(REKEY_LOCK, op);
}

/** The pseudonym in a queued delete's path (`DELETE /exams/{id}/students/{hmac}`, optionally `?permanent=true`). */
const STUDENT_PATH = /\/students\/([^/?]+)(\?[^/]*)?$/;

/** Queued writes of the exam follow the rename: a queued erasure would otherwise replay as a 404 that counts as done, and a queued upload would be refused (422) by the keyed exam. */
async function rewriteQueuedFor(examId: string, renames: Map<string, string>): Promise<void> {
  const prefix = `/exams/${examId}/`.toLowerCase();
  const ours = get(offlineQueue).filter((req) => req.url.toLowerCase().startsWith(prefix));
  // Version-1 values the server did not list yet (a student queued offline): keyed the same way.
  const unlisted = new Set<string>();
  for (const req of ours) {
    const value = STUDENT_PATH.exec(req.url)?.[1] ?? req.body?.pseudonym_hmac;
    if (typeof value === 'string' && (req.body?.pseudonym_version ?? 1) === 1 && !renames.has(value)) unlisted.add(value);
  }
  const keyed = new Map(renames);
  for (const [value, next] of await Promise.all([...unlisted].map(async (v) => [v, await keyFromRaw(examId, v)] as const))) {
    keyed.set(value, next);
  }
  rewriteQueued((req) => {
    if (!req.url.toLowerCase().startsWith(prefix)) return null;
    let { url, body } = req;
    const match = STUDENT_PATH.exec(url);
    const inUrl = match?.[1];
    if (match && inUrl && keyed.has(inUrl)) url = `${url.slice(0, match.index)}/students/${keyed.get(inUrl)}${match[2] ?? ''}`;
    if (typeof body?.pseudonym_hmac === 'string' && (body.pseudonym_version ?? 1) === 1 && keyed.has(body.pseudonym_hmac)) {
      body = { ...body, pseudonym_hmac: keyed.get(body.pseudonym_hmac), pseudonym_version: 2 };
    }
    return url !== req.url || body !== req.body ? { url, body } : null;
  });
}

/** Re-keys one server exam from the server's own complete list (soft-deleted rows included) and rewrites its queued writes. @returns true when the exam is keyed afterwards. */
export async function rekeyServerExam(examId: string): Promise<boolean> {
  return withQueueHeld(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const list = await api.get<PseudonymList>(`/exams/${examId}/pseudonyms`, { silentError: true });
      if (serverVersion(list) === 2) {
        rememberServerVersion(examId, 2);
        return true;
      }
      const pairs = await Promise.all(list.values.map(async (old) => ({ old, new: await keyFromRaw(examId, old) })));
      try {
        await api.post(`/exams/${examId}/pseudonyms/rekey`, { from_version: 1, to_version: 2, pairs }, { silentError: true });
      } catch (err) {
        // A write landed between the read and the rename: read again once.
        if (err instanceof ApiError && err.status === 422 && attempt === 0) continue;
        throw err;
      }
      rememberServerVersion(examId, 2);
      await rewriteQueuedFor(examId, new Map(pairs.map((p) => [p.old, p.new])));
      return true;
    }
    return false;
  });
}

const identityScore = (s: StudentRecord) => [s.studentName, s.studentNumber, s.fallbackCode].filter(Boolean).length;

function sameBytes(a?: Uint8Array, b?: Uint8Array): boolean {
  if (!a || !b) return a === b;
  return a.byteLength === b.byteLength && a.every((v, i) => v === b[i]);
}

class Changed extends Error {}

/** One student out of the rows that collapse onto key `k` (a raw row and a hash row of the same pupil): the one with the most identity, keyed and sealed with its raw and base value. Null when all rows are keyed already. */
async function mergedStudent(
  k: string,
  rows: StudentRecord[],
  key: CryptoKey
): Promise<{ sealed: StudentRecord; replaced: [string, string][] } | null> {
  if (rows.every((r) => r.pseudonymVersion === 2)) return null;
  const best = [...rows].sort((a, b) => identityScore(b) - identityScore(a))[0];
  const legacy = rows.filter((r) => r.pseudonymVersion !== 2).map((r) => r.pseudonymHmac);
  const sealed = await encryptStudent(
    {
      ...best,
      pseudonymHmac: k,
      pseudonymVersion: 2,
      pseudonymRaw: rows.find((r) => r.pseudonymRaw)?.pseudonymRaw ?? legacy.find((v) => v.length !== 64),
      pseudonymBase: rows.find((r) => r.pseudonymBase)?.pseudonymBase ?? (await pseudonymBase(legacy[0])),
    },
    key
  );
  const replaced = rows.filter((r) => r.pseudonymHmac !== k).map((r): [string, string] => [r.examId, r.pseudonymHmac]);
  return { sealed, replaced };
}

/** Re-keys one exam's rows in this browser in one transaction; rows changed since they were read abort it (retried at the next unlock). @returns true when rows were rewritten. */
async function rekeyLocalExam(examId: string, key: CryptoKey): Promise<boolean> {
  const studentRows = await db.examStudents.where('examId').equals(examId).toArray();
  // Only this exam's version-1 submissions, once: a submission row carries its whole scan.
  const legacySubs = db.submissions.where('[examId+pseudonymVersion]').equals([examId, 1]);
  const subRows = await legacySubs.toArray();
  const legacyValues = new Set(
    [...studentRows.filter((r) => r.pseudonymVersion !== 2), ...subRows].map((r) => r.pseudonymHmac)
  );
  if (legacyValues.size === 0) return false;

  const students = await Promise.all(studentRows.map((r) => decryptStudent(r, key)));
  // Never re-seal what did not open: that would replace the real payload with blanks.
  if (students.some((s) => s.decryptFailed)) return false;

  const renames = new Map(
    await Promise.all([...legacyValues].map(async (v) => [v, await keyFromRaw(examId, v)] as const))
  );
  const keyOf = (s: StudentRecord) => (s.pseudonymVersion === 2 ? s.pseudonymHmac : renames.get(s.pseudonymHmac)!);

  const groups = new Map<string, StudentRecord[]>();
  for (const st of students) groups.set(keyOf(st), [...(groups.get(keyOf(st)) ?? []), st]);
  const merged = (await Promise.all([...groups].map(([k, rows]) => mergedStudent(k, rows, key)))).filter((m) => m !== null);

  try {
    await db.transaction('rw', [db.examStudents, db.submissions], async () => {
      // Compare-and-swap: every row must still be exactly as read.
      const now = await db.examStudents.bulkGet(studentRows.map((r) => [r.examId, r.pseudonymHmac]));
      if (now.some((row, i) => !row || !sameBytes(row.payloadCt, studentRows[i].payloadCt))) throw new Changed();
      await db.examStudents.bulkDelete(merged.flatMap((m) => m.replaced));
      await db.examStudents.bulkPut(merged.map((m) => m.sealed));
      // Submissions are bound to their id, not to the pseudonym: renaming the plain column needs no re-seal.
      await legacySubs.modify((sub) => {
        const next = renames.get(sub.pseudonymHmac);
        if (next) {
          sub.pseudonymHmac = next;
          sub.pseudonymVersion = 2;
        }
      });
    });
  } catch (err) {
    if (err instanceof Changed) return false;
    throw err;
  }
  return true;
}

/** Exams in this browser with version-1 rows. Index-only for submissions: loading them would read every scan here on each unlock. */
async function localExamsToRekey(): Promise<Set<string>> {
  const examIds = new Set(
    (await db.examStudents.toArray()).filter((r) => r.pseudonymVersion !== 2).map((r) => r.examId)
  );
  const withSubmissions = (await db.submissions.orderBy('examId').uniqueKeys()) as string[];
  const legacyCounts = await Promise.all(
    withSubmissions.map((examId) => db.submissions.where('[examId+pseudonymVersion]').equals([examId, 1]).count())
  );
  withSubmissions.forEach((examId, i) => {
    if (legacyCounts[i] > 0) examIds.add(examId);
  });
  return examIds;
}

async function rekeyLocal(sessionKey: CryptoKey): Promise<boolean> {
  let changed = false;
  for (const examId of await localExamsToRekey()) {
    try {
      changed = (await rekeyLocalExam(examId, sessionKey)) || changed; // NOSONAR: one exam's transaction at a time, each loads that exam's scans
    } catch (err) {
      console.warn('[pseudonymRekey] exam stays at version 1 in this browser:', err);
    }
  }
  return changed;
}

async function rekeyServer(): Promise<boolean> {
  // Best effort: whatever is still queued afterwards is rewritten with the rename.
  await flushOfflineQueue().catch(() => undefined);
  const exams = await api.get<{ id: string; pseudonym_version?: number }[]>('/exams', { silentError: true });
  let changed = false;
  for (const exam of exams) {
    const version = serverVersion(exam);
    rememberServerVersion(exam.id, version);
    if (version === 2) continue;
    try {
      changed = (await rekeyServerExam(exam.id)) || changed; // NOSONAR: each rekey holds the offline queue's Web Lock, so they run one after another anyway
    } catch (err) {
      console.warn('[pseudonymRekey] exam stays at version 1 on the server:', err);
    }
  }
  return changed;
}

/** Re-keys every version-1 exam where results live and tells other tabs to reload; the caller holds the re-key lock. @returns true when anything was re-keyed. */
export async function rekeyWhereResultsLive(): Promise<boolean> {
  const { masterKey, sessionKey } = get(sessionStore);
  if (!masterKey || !sessionKey) return false;
  const changed = resultsAreLocal() ? await rekeyLocal(sessionKey) : await rekeyServer();
  if (changed) safeLocalStorage.setItem(REKEYED_KEY, String(Date.now()));
  return changed;
}

/** Runs after `openWorkspace()` reports `ok` and before routes mount (they wait on the session gate). Never throws: an exam that could not move keeps working at version 1. */
export async function runPseudonymRekey(): Promise<boolean> {
  try {
    return await withRekeyLock(rekeyWhereResultsLive);
  } catch (err) {
    console.warn('[pseudonymRekey] skipped:', err);
    return false;
  }
}

/** Runs `op` under the re-key's Web Lock; the results mover moves under it and re-keys with `rekeyWhereResultsLive`. */
export function withPseudonymLock<T>(op: () => Promise<T>): Promise<T> {
  return withRekeyLock(op);
}
