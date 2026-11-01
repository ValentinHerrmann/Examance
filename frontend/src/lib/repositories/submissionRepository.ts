import { api } from '#lib/api/client';
import { db } from '#lib/db/db';
import { resultsAreLocal } from '#lib/stores/storagePolicy';
import { encryptSubmission, decryptSubmission } from '#lib/db/dbEncryption';
import { enqueueOrThrow } from '#lib/services/offlineQueue';
import type { SubmissionRecord } from '#lib/db/schema';
import { uint8ArrayToBase64, base64ToUint8Array } from '#lib/crypto/aesGcm';
import { joinKey, pseudonymBase, serverVersion } from '#lib/crypto/pseudonymKey';
import { examRepository } from '#lib/repositories/examRepository';
import { deleteUrl, trashHeaders, type DeleteOptions } from '#lib/trash/group';
import { captureLocal, storedSubmissionRows } from '#lib/trash/localTrash';

export function mapApiToSubmissionRecord(s: any, fallbackExamId: string): SubmissionRecord {
  return {
    id: s.id,
    examId: s.exam_id || fallbackExamId,
    pseudonymHmac: s.pseudonym_hmac,
    pseudonymVersion: serverVersion(s),
    totalScore: s.total_score ?? s.totalScore,
    createdAt: s.created_at || s.createdAt || new Date().toISOString(),
    scanCt: s.scan_ciphertext_b64 ? base64ToUint8Array(s.scan_ciphertext_b64) : undefined,
    scanIv: s.scan_iv_b64 ? base64ToUint8Array(s.scan_iv_b64) : undefined,
    annotationCt: s.annotation_ciphertext_b64 ? base64ToUint8Array(s.annotation_ciphertext_b64) : undefined,
    annotationIv: s.annotation_iv_b64 ? base64ToUint8Array(s.annotation_iv_b64) : undefined,
    // Cheap presence flags the list endpoint always sends, even when the actual scan/annotation bytes are omitted (see `includeScans` below) — lets a "has a scan?" indicator stay correct without paying for the PDF.
    hasScan: s.has_scan ?? Boolean(s.scan_ciphertext_b64),
    hasAnnotations: s.has_annotations ?? Boolean(s.annotation_ciphertext_b64),
  };
}

/** Query-string suffix for the list endpoint's scan-bytes opt-in. */
const includeScansQS = (includeScans: boolean | undefined) =>
  includeScans ? '?include_scans=true' : '';

/** The `POST /exams/{id}/submissions` body for a decrypted submission (scan bytes stay sealed). */
export async function submissionServerPayload(submission: SubmissionRecord, opts: { clearAnnotations?: boolean } = {}) {
  const version = submission.pseudonymVersion ?? 1;
  return {
    id: submission.id,
    // A version-1 value is sent as older builds did: its SHA-256 form.
    pseudonym_hmac: version === 2 ? submission.pseudonymHmac : await pseudonymBase(submission.pseudonymHmac),
    pseudonym_version: version,
    total_score: submission.totalScore ?? null,
    scan_ciphertext_b64: submission.scanCt ? uint8ArrayToBase64(submission.scanCt) : undefined,
    scan_iv_b64: submission.scanIv ? uint8ArrayToBase64(submission.scanIv) : undefined,
    annotation_ciphertext_b64: submission.annotationCt ? uint8ArrayToBase64(submission.annotationCt) : undefined,
    annotation_iv_b64: submission.annotationIv ? uint8ArrayToBase64(submission.annotationIv) : undefined,
    clear_annotations: opts.clearAnnotations ?? false,
  };
}

export const submissionRepository = {
    /** @param knownExams exams the caller already has, avoiding a second `/exams` fetch. */
    /**
     * @param opts.includeScans Ship every submission's scan PDF too. Off by default (a list is metadata;
     *   `hasScan` says whether one exists): only export/archive and bulk scan flows needing all bytes
     *   should set it; otherwise load lazily via `getById`. Ignored in local mode (Dexie has it all decrypted).
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
      const exams = knownExams ?? (await examRepository.getAll(key));
      // In parallel, so the dashboard doesn't wait for one round-trip per exam. silentError: one modal per exam would be a wall of dialogs; a failed read throws and the caller reports it (never a partial list).
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
      // silentError: a failed read throws and the caller reports it; never "no submissions".
      const rawList = await api.get<any[]>(
        `/exams/${examId}/submissions${includeScansQS(opts.includeScans)}`,
        { silentError: true }
      );
      return rawList.map((s: any) => mapApiToSubmissionRecord(s, examId));
    }
  },

  async getById(examId: string, id: string, key: CryptoKey | null): Promise<SubmissionRecord | null> {
    if (resultsAreLocal()) {
      const raw = await db.submissions.get(id);
      return raw ? decryptSubmission(raw, key) : null;
    } else {
      try {
        const s = await api.get<any>(`/exams/${examId}/submissions/${id}`, { silentError: true });
        return mapApiToSubmissionRecord(s, examId);
      } catch (err: any) {
        // Only "does not exist" is null; any other failed read must not look like a missing submission.
        if (err?.status === 404) return null;
        throw err;
      }
    }
  },

    /** @param opts.clearAnnotations Delete any stored annotation layer; omitting the annotation ciphertext means "don't touch", so deleting needs this flag. */
  async save(
    submission: SubmissionRecord,
    key: CryptoKey | null,
    opts: { clearAnnotations?: boolean; group?: string } = {}
  ): Promise<void> {
    if (resultsAreLocal()) {
      // This browser stores keyed rows only, so a record read before the re-key cannot write its old value back.
      const keyed: SubmissionRecord =
        submission.pseudonymVersion === 2
          ? submission
          : { ...submission, pseudonymHmac: await joinKey(submission), pseudonymVersion: 2 };
      const encrypted = await encryptSubmission(keyed, key);
      await db.submissions.put(encrypted);
    } else {
      const payload = await submissionServerPayload(submission, opts);
      // Cleared annotations go to the trash of this action's group (issue #125).
      const headers = trashHeaders({ group: opts.group });
      try {
        await api.post(`/exams/${submission.examId}/submissions`, payload, { silentError: true, headers });
      } catch (err) {
        enqueueOrThrow(err, `/exams/${submission.examId}/submissions`, 'POST', payload, headers);
      }
    }
  },

  /** Deletes a submission with its scores. Unless `opts.permanent`, a copy goes to the trash (the server's, or this browser's in hybrid mode; issue #125). */
  async delete(examId: string, id: string, opts: DeleteOptions = {}): Promise<void> {
    if (resultsAreLocal()) {
      const rows = await storedSubmissionRows(id);
      await captureLocal(opts, {
        kind: 'submission',
        examId,
        submissionId: id,
        pseudonymHmac: rows.submissions[0]?.pseudonymHmac,
        rows,
      });
      await db.exerciseScores.where('submissionId').equals(id).delete();
      await db.submissions.delete(id);
    } else {
      // The server deletes (and trashes) the scores with the submission; the local mirror goes too, so a fallback read cannot resurrect them.
      await db.exerciseScores.where('submissionId').equals(id).delete();
      const url = deleteUrl(`/exams/${examId}/submissions/${id}`, opts);
      const headers = trashHeaders(opts);
      try {
        await api.delete(url, { silentError: true, headers });
      } catch (err) {
        enqueueOrThrow(err, url, 'DELETE', undefined, headers);
      }
    }
  },

  async clearGrading(examId: string, id: string, key: CryptoKey | null, opts: DeleteOptions = {}): Promise<void> {

    if (resultsAreLocal()) {
      const raw = await db.submissions.get(id);
      const { exerciseScores } = await storedSubmissionRows(id);
      await captureLocal(opts, {
        kind: 'grading',
        examId,
        submissionId: id,
        pseudonymHmac: raw?.pseudonymHmac,
        rows: { exerciseScores },
        cleared: raw ? [raw] : [],
      });
      // Local only: in server mode DELETE /grading clears the score rows in the same transaction as the total and the annotations.
      await db.exerciseScores.where('submissionId').equals(id).delete();

      // Must decrypt → modify → re-encrypt → save, because submissions are stored encrypted in IndexedDB. Directly updating the encrypted record won't work since fields like totalScore don't exist at the encrypted storage level.
      if (!raw) return;
      const sub = await decryptSubmission(raw, key);
      sub.totalScore = undefined;
      sub.annotationCt = undefined;
      sub.annotationIv = undefined;
      const encrypted = await encryptSubmission(sub, key);
      await db.submissions.put(encrypted);
    } else {
      // all-server mode: use dedicated DELETE /grading endpoint which atomically clears total_score, annotations and the per-exercise scores in a single request. The local mirror goes too, so a fallback read cannot resurrect them.
      await db.exerciseScores.where('submissionId').equals(id).delete();
      const url = `/exams/${examId}/submissions/${id}/grading`;
      const headers = trashHeaders(opts);
      try {
        await api.delete(url, { silentError: true, headers });
      } catch (err) {
        enqueueOrThrow(err, url, 'DELETE', undefined, headers);
      }
    }
  },
};
