/** Pseudonyms in .examance archives (payload v5, issue #177): a keyed value belongs to one exam of one account, so an import re-keys it into the importing account's exam from the archived base or raw value; payloads up to v4 carry version-1 values. */

import { uint8ArrayToBase64 } from '#lib/crypto/aesGcm';
import { keyFromRaw, pseudonymBase } from '#lib/crypto/pseudonymKey';
import { currentKeyId } from '#lib/services/keyEnvelopeService';
import type { PseudonymVersion } from '#lib/db/schema';

type Row = Record<string, any>;

/** Names the data-key generation that keyed an archive's pseudonyms. */
export function archiveKeyId(): string {
  return uint8ArrayToBase64(currentKeyId());
}

/** A student's or submission's archived value and version, whatever payload version wrote it. */
export function archivedPseudonym(row: Row): { value: string; version: PseudonymVersion } {
  const value: string = row.pseudonymHmac ?? row.pseudonymId ?? row.pseudonymHash ?? '';
  return { value, version: row.pseudonymVersion === 2 ? 2 : 1 };
}

/** What the value was keyed from, when the archive says: the base or raw value, or a version-1 value itself. */
function sourceOf(row: Row): string | undefined {
  const { value, version } = archivedPseudonym(row);
  return row.pseudonymBase ?? row.pseudonymRaw ?? (version === 1 ? value : undefined);
}

/** The keyed value an archived row stands for in `examId` of this account. `opaque` when it cannot be re-keyed (keyed by another account, no base archived): kept as it is, so students and submissions still meet. */
export async function archivedJoinKey(
  row: Row,
  examId: string,
  sameKeyedExam: boolean
): Promise<{ key: string; opaque: boolean }> {
  const { value, version } = archivedPseudonym(row);
  if (version === 2 && sameKeyedExam) return { key: value, opaque: false };
  const source = sourceOf(row);
  if (source !== undefined) return { key: await keyFromRaw(examId, source), opaque: false };
  return { key: value, opaque: true };
}

/** The pseudonym fields an imported row is written with, in the target exam at its write version. */
export async function importedPseudonym(
  row: Row,
  targetExamId: string,
  targetVersion: PseudonymVersion,
  sameKeyedExam: boolean
): Promise<{ pseudonymHmac: string; pseudonymVersion: PseudonymVersion }> {
  if (targetVersion === 2) {
    const { key } = await archivedJoinKey(row, targetExamId, sameKeyedExam);
    return { pseudonymHmac: key, pseudonymVersion: 2 };
  }
  const source = sourceOf(row);
  return {
    pseudonymHmac: source !== undefined ? await pseudonymBase(source) : archivedPseudonym(row).value,
    pseudonymVersion: 1,
  };
}
