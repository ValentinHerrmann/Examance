/** GDPR Art. 17 Right to Erasure: deletes a student identity and all their submissions wherever they live, and appends an AUDITLOG entry. */

import { db } from '#lib/db/db';
import { sessionStore } from '#lib/stores/session';
import { encryptAuditEntry } from '#lib/db/dbEncryption';
import { joinKey, pseudonymBase } from '#lib/crypto/pseudonymKey';
import { studentRepository } from '#lib/repositories/studentRepository';
import { submissionRepository } from '#lib/repositories/submissionRepository';
import { resultsAreLocal } from '#lib/stores/storagePolicy';
import { api } from '#lib/api/client';
import { pendingWritesCount } from '#lib/services/offlineQueue';
import { get } from 'svelte/store';
import type { StudentRecord } from '#lib/db/schema';

export interface ErasureResult {
  /** The erased student's keyed pseudonym (what the audit entry names). */
  pseudonymHmac: string;
  submissionsErased: number;
  auditEntryId: string;
  /** `pending`: a server delete was queued offline and runs when the connection returns (F3). */
  status: 'erased' | 'pending';
}

type ErasedStudent = Pick<StudentRecord, 'examId' | 'pseudonymHmac' | 'pseudonymVersion' | 'pseudonymBase'>;

/** Permanently erase a student's identity and submissions (the stored record, within its exam) in both storage modes. */
export async function eraseStudent(student: ErasedStudent): Promise<ErasureResult> {
  const { examId } = student;
  const auditId = crypto.randomUUID();
  // One value for every version a row of this student may be stored at.
  const target = await joinKey(student);

  const key = get(sessionStore).sessionKey;
  const queuedBefore = get(pendingWritesCount);
  const encryptedAudit = await encryptAuditEntry({
    id: auditId,
    action: 'DELETE',
    targetId: target,
    timestamp: new Date().toISOString(),
    note: 'GDPR Art. 17 student erasure',
  }, key);

  // Hybrid: a server copy can outlive a switch from all-server (the move may keep it), keyed or not yet. Delete it first, so a failure (reported by the caller) leaves everything in place for a retry; 404 means none exists.
  if (resultsAreLocal()) {
    const base = student.pseudonymBase ?? (student.pseudonymVersion === 2 ? null : await pseudonymBase(student.pseudonymHmac));
    for (const serverValue of new Set([target, ...(base ? [base] : [])])) {
      try {
        await api.delete(`/exams/${examId}/students/${serverValue}`, { silentError: true });
      } catch (err) {
        if ((err as { status?: unknown })?.status !== 404) throw err;
      }
    }
  }

  // THIS student's submissions only, compared on the join key: a truthiness check would match every submission and erase all students' work.
  const matchingSubs: Awaited<ReturnType<typeof submissionRepository.getByExamId>> = [];
  for (const sub of await submissionRepository.getByExamId(examId, key)) {
    if (sub.pseudonymHmac && (await joinKey(sub)) === target) matchingSubs.push(sub);
  }

  // Through the repositories, so each mode's copy goes (scores included); a refused server delete throws. A failed list above throws before anything is deleted, so the caller reports it and a retry is safe.
  for (const sub of matchingSubs) {
    await submissionRepository.delete(examId, sub.id);
  }
  await studentRepository.delete(student);

  await db.transaction('rw', [db.submissions, db.auditLog], async () => {
    await db.submissions.bulkDelete(matchingSubs.map((sub) => sub.id));
    await db.auditLog.add(encryptedAudit);
  });

  sessionStore.setDirty(true);

  return {
    pseudonymHmac: target,
    submissionsErased: matchingSubs.length,
    auditEntryId: auditId,
    status: get(pendingWritesCount) > queuedBefore ? 'pending' : 'erased',
  };
}
