/**
 * Audit log helper for CSV and PDF grade exports.
 */

import { db } from '#lib/db/db';
import { encryptAuditEntry } from '#lib/db/dbEncryption';
import { sha256Hex } from '#lib/crypto/hex';

/** Log a CSV or data export (`exportFormat` e.g. 'CSV', '.bgproj', 'PDF') of an exam to the audit log, encrypted with the session `key`. */
export async function logExportAction(examId: string, exportFormat: string, key: CryptoKey | null): Promise<string> {
  const auditId = crypto.randomUUID();

  const targetHash = await sha256Hex(examId);

  const plainEntry = {
    id: auditId,
    action: 'EXPORT' as const,
    targetId: targetHash,
    timestamp: new Date().toISOString(),
    note: `Grade export in format: ${exportFormat}`,
  };

  const encrypted = await encryptAuditEntry(plainEntry, key);
  await db.auditLog.add(encrypted);

  return auditId;
}
