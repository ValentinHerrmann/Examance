/** GDPR Art. 17 Right to Erasure: deletes a student identity and all their submissions wherever they live, and appends an AUDITLOG entry. */

import { db } from '#lib/db/db';
import { sessionStore } from '#lib/stores/session';
import { encryptAuditEntry } from '#lib/db/dbEncryption';
import { ensure64CharHex } from '#lib/crypto/hmac';
import { studentRepository } from '#lib/repositories/studentRepository';
import { submissionRepository } from '#lib/repositories/submissionRepository';
import { resultsAreLocal } from '#lib/stores/storagePolicy';
import { api } from '#lib/api/client';
import { get } from 'svelte/store';

export interface ErasureResult {
  pseudonymId: string;
  submissionsErased: number;
  auditEntryId: string;
}

/** Permanently erase a student's identity and submissions (by raw pseudonym ID, within an exam) in both storage modes. */
export async function eraseStudent(pseudonymId: string, examId: string): Promise<ErasureResult> {
  const auditId = crypto.randomUUID();
  // The same key the server stores the identity under (`pseudonym_hmac`).
  const pseudonymHmac = await ensure64CharHex(pseudonymId);

  const key = get(sessionStore).sessionKey;
  const encryptedAudit = await encryptAuditEntry({
    id: auditId,
    action: 'DELETE',
    targetId: pseudonymHmac,
    timestamp: new Date().toISOString(),
    note: 'GDPR Art. 17 student erasure',
  }, key);

  // Hybrid: a server copy can outlive a switch from all-server (the move may keep it). Delete it first,
  // so a failure (reported by the caller) leaves everything in place for a retry; 404 means none exists.
  if (resultsAreLocal()) {
    try {
      await api.delete(`/exams/${examId}/students/${pseudonymHmac}`, { silentError: true });
    } catch (err) {
      if ((err as { status?: unknown })?.status !== 404) throw err;
    }
  }

  // THIS student's submissions only: locally `pseudonymHash` holds the raw pseudonymId, the server sends the HMAC.
  // Compare exactly: a truthiness check would match every submission and erase all students' work.
  const matchingSubs = (await submissionRepository.getByExamId(examId, key)).filter(
    (s) => s.pseudonymHash === pseudonymId || s.pseudonymHash === pseudonymHmac
  );

  // Through the repositories, so each mode's copy goes (scores included); a refused server delete throws.
  // In all-server the identity delete also cascades server-side, so a failed list above loses nothing.
  for (const sub of matchingSubs) {
    await submissionRepository.delete(examId, sub.id);
  }
  await studentRepository.delete(examId, pseudonymId);

  await db.transaction('rw', [db.submissions, db.auditLog], async () => {
    await db.submissions.bulkDelete(matchingSubs.map((sub) => sub.id));
    // Append immutable audit log entry
    await db.auditLog.add(encryptedAudit);
  });

  sessionStore.setDirty(true);

  return {
    pseudonymId,
    submissionsErased: matchingSubs.length,
    auditEntryId: auditId,
  };
}
