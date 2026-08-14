/**
 * GDPR Art. 15 / Art. 20 — subject access export for a single student.
 *
 * The `.bgproj` archive is a teacher-key-encrypted backup of the whole
 * workspace: useful for disaster recovery, useless as the "copy of the personal
 * data undergoing processing" a data subject is entitled to. This produces that
 * copy — one student, decrypted, in a readable format the school can hand over.
 *
 * Mirrors erasure.ts in structure: resolve via the repositories, decrypt with
 * the active session key, and record the disclosure in the audit log.
 */

import { get } from 'svelte/store';

import { db } from '$lib/db/db';
import {
  decryptScore,
  decryptStudent,
  decryptSubmission,
  encryptAuditEntry,
} from '$lib/db/dbEncryption';
import { sessionStore } from '$lib/stores/session';

export interface SubjectAccessSubmission {
  submissionId: string;
  examId: string;
  examTitle: string | null;
  totalScore: number | null;
  createdAt: string | null;
  hasScan: boolean;
  hasAnnotations: boolean;
  exerciseScores: { exerciseId: string; score: number | null }[];
}

export interface SubjectAccessExport {
  generatedAt: string;
  pseudonymId: string;
  identity: {
    studentName: string | null;
    studentNumber: string | null;
    fallbackCode: string | null;
  };
  submissions: SubjectAccessSubmission[];
  /** Plain-language notes required by Art. 15(1)(a)-(h). */
  notes: string[];
}

/**
 * Build a decrypted export of everything held about one student.
 *
 * @param pseudonymId Raw pseudonym ID (as shown in the erasure table).
 * @throws if the session is locked — nothing can be decrypted without the key.
 */
export async function exportStudentData(pseudonymId: string): Promise<SubjectAccessExport> {
  const key = get(sessionStore).sessionKey;
  if (!key) {
    throw new Error('Unlock the workspace before exporting student data.');
  }

  const rawStudent = await db.students.get(pseudonymId);
  if (!rawStudent) {
    throw new Error('No student found for that pseudonym.');
  }
  const student = await decryptStudent(rawStudent, key);

  // Locally, a submission's `pseudonymHash` holds the raw pseudonymId.
  const rawSubmissions = await db.submissions
    .where('pseudonymHash')
    .equals(pseudonymId)
    .toArray();

  const submissions: SubjectAccessSubmission[] = [];
  for (const raw of rawSubmissions) {
    const sub = await decryptSubmission(raw, key);
    const rawScores = await db.exerciseScores
      .where('submissionId')
      .equals(raw.id)
      .toArray();
    const exerciseScores = [];
    for (const rawScore of rawScores) {
      const score = await decryptScore(rawScore, key);
      exerciseScores.push({ exerciseId: score.exerciseId, score: score.score ?? null });
    }

    const exam = await db.exams.get(sub.examId);
    submissions.push({
      submissionId: sub.id,
      examId: sub.examId,
      examTitle: exam ? (exam as { title?: string }).title ?? null : null,
      totalScore: sub.totalScore ?? null,
      createdAt: sub.createdAt ?? null,
      hasScan: Boolean(raw.scanCt),
      hasAnnotations: Boolean(raw.annotationCt),
      exerciseScores,
    });
  }

  // Record the disclosure. targetId is hashed by encryptAuditEntry's caller
  // convention elsewhere in this module; keep the same shape.
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(pseudonymId)
  );
  const targetHash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  await db.auditLog.add(
    await encryptAuditEntry(
      {
        id: crypto.randomUUID(),
        action: 'EXPORT',
        targetId: targetHash,
        timestamp: new Date().toISOString(),
        note: 'GDPR Art. 15 subject access export',
      },
      key
    )
  );

  return {
    generatedAt: new Date().toISOString(),
    pseudonymId,
    identity: {
      studentName: student.studentName ?? null,
      studentNumber: student.studentNumber ?? null,
      fallbackCode: student.fallbackCode ?? null,
    },
    submissions,
    notes: [
      'Scan images and grading annotations are stored encrypted; they are not included inline. Request them separately if needed.',
      'Submissions are linked to a pseudonym, not to a name. The mapping is held only in this browser and is what identifies you here.',
      'Retention: exam data is deleted after the retention date set for each exam.',
    ],
  };
}

/** Serialise an export as a downloadable JSON blob. */
export function toDownloadableJson(data: SubjectAccessExport): Blob {
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}
