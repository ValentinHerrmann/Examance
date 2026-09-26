import { api } from '$lib/api/client';
import { db } from '$lib/db/db';
import { resultsAreLocal } from '$lib/stores/storagePolicy';
import { encryptSubmission, decryptSubmission } from '$lib/db/dbEncryption';
import { enqueueRequest } from '$lib/services/offlineQueue';
import type { SubmissionRecord } from '$lib/db/schema';
import { uint8ArrayToBase64, base64ToUint8Array } from '$lib/crypto/aesGcm';
import { ensure64CharHex } from '$lib/crypto/hmac';
import { examRepository } from '$lib/repositories/examRepository';
import { scoreRepository } from '$lib/repositories/scoreRepository';

export function mapApiToSubmissionRecord(s: any, fallbackExamId: string): SubmissionRecord {
  return {
    id: s.id,
    examId: s.exam_id || fallbackExamId,
    pseudonymHash: s.pseudonym_hmac || s.pseudonymHash,
    totalScore: s.total_score ?? s.totalScore,
    createdAt: s.created_at || s.createdAt || new Date().toISOString(),
    scanCt: s.scan_ciphertext_b64 ? base64ToUint8Array(s.scan_ciphertext_b64) : undefined,
    scanIv: s.scan_iv_b64 ? base64ToUint8Array(s.scan_iv_b64) : undefined,
    annotationCt: s.annotation_ciphertext_b64 ? base64ToUint8Array(s.annotation_ciphertext_b64) : undefined,
    annotationIv: s.annotation_iv_b64 ? base64ToUint8Array(s.annotation_iv_b64) : undefined,
    // Cheap presence flags the list endpoint always sends, even when the
    // actual scan/annotation bytes are omitted (see `includeScans` below) —
    // lets a "has a scan?" indicator stay correct without paying for the PDF.
    hasScan: s.has_scan ?? Boolean(s.scan_ciphertext_b64),
    hasAnnotations: s.has_annotations ?? Boolean(s.annotation_ciphertext_b64),
  };
}

/** Query-string suffix for the list endpoint's scan-bytes opt-in. */
const includeScansQS = (includeScans: boolean | undefined) =>
  includeScans ? '?include_scans=true' : '';

export const submissionRepository = {
  /**
   * @param knownExams exams the caller already has, to avoid a second
   *   `/exams` fetch just to learn which ids to ask about.
   */
  /**
   * @param opts.includeScans Ask the server to ship every submission's scan
   *   PDF too. Off by default — a list is metadata (`hasScan` still tells you
   *   whether one exists); only export/archive and bulk scan-processing flows
   *   that genuinely need every submission's bytes at once should set this.
   *   Everything else loads a scan lazily via `getById` when it is opened.
   *   Local mode ignores this — Dexie already has everything decrypted.
   */
  async getAll(
    key: CryptoKey | null,
    knownExams?: { id: string }[],
    opts: { includeScans?: boolean } = {}
  ): Promise<SubmissionRecord[]> {
    if (resultsAreLocal()) {
      const raw = await db.submissions.toArray();
      return Promise.all(raw.map((sub) => decryptSubmission(sub, key)));
    } else {
      // Remote mode: backend has no /submissions endpoint, so fetch per-exam
      try {
        const exams = knownExams ?? (await examRepository.getAll(key));
        // In parallel, so the dashboard doesn't wait for one round-trip per
        // exam. silentError throughout: the caller falls back to no
        // statistics, and one modal per exam would be a wall of dialogs.
        const perExam = await Promise.all(
          exams.map(async (exam) => {
            const rawList = await api.get<any[]>(
              `/exams/${exam.id}/submissions${includeScansQS(opts.includeScans)}`,
              { silentError: true }
            );
            return rawList.map((s: any) => mapApiToSubmissionRecord(s, exam.id));
          })
        );
        return perExam.flat();
      } catch {
        return [];
      }
    }
  },

  async getByExamId(
    examId: string,
    key: CryptoKey | null,
    opts: { includeScans?: boolean } = {}
  ): Promise<SubmissionRecord[]> {
    if (resultsAreLocal()) {
      const raw = await db.submissions.where('examId').equals(examId).toArray();
      return Promise.all(raw.map((sub) => decryptSubmission(sub, key)));
    } else {
      try {
        const rawList = await api.get<any[]>(
          `/exams/${examId}/submissions${includeScansQS(opts.includeScans)}`
        );
        return rawList.map((s: any) => mapApiToSubmissionRecord(s, examId));
      } catch {
        return [];
      }
    }
  },

  async getById(examId: string, id: string, key: CryptoKey | null): Promise<SubmissionRecord | null> {
    if (resultsAreLocal()) {
      const raw = await db.submissions.get(id);
      return raw ? decryptSubmission(raw, key) : null;
    } else {
      try {
        const s = await api.get<any>(`/exams/${examId}/submissions/${id}`);
        return mapApiToSubmissionRecord(s, examId);
      } catch {
        return null;
      }
    }
  },

  /**
   * @param opts.clearAnnotations Delete any stored annotation layer. Omitting
   *   the annotation ciphertext means "don't touch annotations" — deleting
   *   requires this flag.
   */
  async save(
    submission: SubmissionRecord,
    key: CryptoKey | null,
    opts: { clearAnnotations?: boolean } = {}
  ): Promise<void> {
    if (resultsAreLocal()) {
      const encrypted = await encryptSubmission(submission, key);
      await db.submissions.put(encrypted);
    } else {
      const pseudonymHmac = await ensure64CharHex(submission.pseudonymHash);
      const payload = {
        id: submission.id,
        pseudonym_hmac: pseudonymHmac,
        total_score: submission.totalScore ?? null,
        scan_ciphertext_b64: submission.scanCt ? uint8ArrayToBase64(submission.scanCt) : undefined,
        scan_iv_b64: submission.scanIv ? uint8ArrayToBase64(submission.scanIv) : undefined,
        annotation_ciphertext_b64: submission.annotationCt ? uint8ArrayToBase64(submission.annotationCt) : undefined,
        annotation_iv_b64: submission.annotationIv ? uint8ArrayToBase64(submission.annotationIv) : undefined,
        clear_annotations: opts.clearAnnotations ?? false,
      };
      try {
        await api.post(`/exams/${submission.examId}/submissions`, payload);
      } catch {
        enqueueRequest(`/exams/${submission.examId}/submissions`, 'POST', payload);
      }
    }
  },

  async delete(examId: string, id: string): Promise<void> {

    // Always clean up associated exercise scores to prevent orphaned data
    // from polluting analytics. Through the repository, so server-held rows
    // are deleted too.
    await scoreRepository.deleteBySubmissionId(examId, id);

    if (resultsAreLocal()) {
      await db.submissions.delete(id);
    } else {
      try {
        await api.delete(`/exams/${examId}/submissions/${id}`);
      } catch {
        enqueueRequest(`/exams/${examId}/submissions/${id}`, 'DELETE');
      }
    }
  },

  async clearGrading(examId: string, id: string, key: CryptoKey | null): Promise<void> {

    if (resultsAreLocal()) {
      // Local only: in server mode DELETE /grading clears the score rows in the
      // same transaction as the total and the annotations.
      await scoreRepository.deleteBySubmissionId(examId, id);

      // Must decrypt → modify → re-encrypt → save, because submissions are stored
      // encrypted in IndexedDB. Directly updating the encrypted record won't work
      // since fields like totalScore don't exist at the encrypted storage level.
      const raw = await db.submissions.get(id);
      if (!raw) return;
      const sub = await decryptSubmission(raw, key);
      sub.totalScore = undefined;
      sub.annotationCt = undefined;
      sub.annotationIv = undefined;
      const encrypted = await encryptSubmission(sub, key);
      await db.submissions.put(encrypted);
    } else {
      // all-server mode: use dedicated DELETE /grading endpoint which atomically clears
      // total_score, annotations and the per-exercise scores in a single request.
      // The local mirror goes too, so a fallback read cannot resurrect them.
      await db.exerciseScores.where('submissionId').equals(id).delete();
      try {
        await api.delete(`/exams/${examId}/submissions/${id}/grading`);
      } catch {
        enqueueRequest(`/exams/${examId}/submissions/${id}/grading`, 'DELETE');
      }
    }
  },
};
