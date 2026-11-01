/** GDPR Art. 15 / Art. 20 subject access export for one student: the readable, decrypted copy of their personal data that the teacher-key-encrypted `.bgproj` backup cannot serve. Mirrors erasure.ts: resolve via repositories, decrypt with the session key, record the disclosure in the audit log. */

import { get } from 'svelte/store';

import { db } from '#lib/db/db';
import { joinKey } from '#lib/crypto/pseudonymKey';
import type { StudentRecord } from '#lib/db/schema';
import { examRepository } from '#lib/repositories/examRepository';
import { scoreRepository } from '#lib/repositories/scoreRepository';
import { studentRepository } from '#lib/repositories/studentRepository';
import { submissionRepository } from '#lib/repositories/submissionRepository';
import { encryptAuditEntry } from '#lib/db/dbEncryption';
import { sessionStore } from '#lib/stores/session';

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
  /** The student's keyed pseudonym, as the audit entry names it. */
  pseudonymHmac: string;
  identity: {
    studentName: string | null;
    studentNumber: string | null;
    fallbackCode: string | null;
  };
  submissions: SubjectAccessSubmission[];
  /** Plain-language notes required by Art. 15(1)(a)-(h). */
  notes: string[];
}

/** Build a decrypted export of everything held about one student (a stored record, within its exam), through the repositories so it works in both storage modes (F1). @throws if the session is locked or the student is unknown. */
export async function exportStudentData(
  who: Pick<StudentRecord, 'examId' | 'pseudonymHmac' | 'pseudonymVersion'>
): Promise<SubjectAccessExport> {
  const { examId } = who;
  const key = get(sessionStore).sessionKey;
  if (!key) {
    throw new Error('Unlock the workspace before exporting student data.');
  }
  // Rows meet on the join key, whatever pseudonym version each is stored at (as erasure.ts does).
  const pseudonymHmac = await joinKey(who);

  // Every row's key is independent: match them all at once, keeping the rows' order.
  const ofThisStudent = async <T extends Parameters<typeof joinKey>[0]>(rows: T[]) => {
    const hits = await Promise.all(rows.map(async (row) => !!row.pseudonymHmac && (await joinKey(row)) === pseudonymHmac));
    return rows.filter((_, i) => hits[i]);
  };

  const student = (await ofThisStudent(await studentRepository.getByExamId(examId, key))).at(-1);
  if (!student) {
    throw new Error('No student found for that pseudonym.');
  }

  const exam = await examRepository.getById(examId, key);
  const ownSubmissions = await ofThisStudent(await submissionRepository.getByExamId(examId, key));
  const submissions: SubjectAccessSubmission[] = await Promise.all(
    ownSubmissions.map(async (sub) => ({
      submissionId: sub.id,
      examId,
      examTitle: exam?.title ?? null,
      totalScore: sub.totalScore ?? null,
      createdAt: sub.createdAt ?? null,
      hasScan: sub.hasScan ?? Boolean(sub.scanCt),
      hasAnnotations: sub.hasAnnotations ?? Boolean(sub.annotationCt),
      exerciseScores: (await scoreRepository.getBySubmissionId(examId, sub.id, key)).map((score) => ({
        exerciseId: score.exerciseId,
        score: score.score ?? null,
      })),
    })),
  );

  // Record the disclosure under the same target as an erasure (the pseudonym's HMAC).
  await db.auditLog.add(
    await encryptAuditEntry(
      {
        id: crypto.randomUUID(),
        action: 'EXPORT',
        targetId: pseudonymHmac,
        timestamp: new Date().toISOString(),
        note: 'GDPR Art. 15 subject access export',
      },
      key
    )
  );

  return {
    generatedAt: new Date().toISOString(),
    pseudonymHmac,
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
