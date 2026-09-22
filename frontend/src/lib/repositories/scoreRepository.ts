/**
 * Per-exercise grading results.
 *
 * Until this existed, scores were written straight to Dexie by
 * `saveScoreEncrypted()` with no storage-mode branch and no server counterpart —
 * in every mode, including `all-server`, where `lockSession()` wipes IndexedDB
 * on the 60-minute idle timeout. Grading an exam on the server and walking away
 * destroyed every per-question score, MC selection and OMR result; only the
 * submission's `totalScore` survived.
 *
 * Mode branching matches `submissionRepository`: scores are grading results, so
 * `hybrid` keeps them local by design, and only `all-server` goes to the API.
 * The payload stays opaque to the server — `encryptScore()` seals score,
 * `selectedOptions` and `omrMeta` together before it leaves the browser.
 */

import { get } from 'svelte/store';
import { api } from '$lib/api/client';
import { db } from '$lib/db/db';
import { storagePolicyStore } from '$lib/stores/storagePolicy';
import { encryptScore, decryptScore } from '$lib/db/dbEncryption';
import { enqueueRequest } from '$lib/services/offlineQueue';
import { uint8ArrayToBase64, base64ToUint8Array } from '$lib/crypto/aesGcm';
import type { ExerciseScoreRecord } from '$lib/db/schema';

/** True when scores live in IndexedDB rather than on the server. */
function isLocalScoreStore(): boolean {
  const mode = get(storagePolicyStore).storageMode;
  return mode === 'all-local' || mode === 'hybrid';
}

export function mapApiToScoreRecord(s: any): ExerciseScoreRecord {
  return {
    id: s.id,
    submissionId: s.submission_id ?? s.submissionId,
    exerciseId: s.exercise_id ?? s.exerciseId,
    payloadCt: s.payload_ciphertext_b64 ? base64ToUint8Array(s.payload_ciphertext_b64) : undefined,
    payloadIv: s.payload_iv_b64 ? base64ToUint8Array(s.payload_iv_b64) : undefined,
  };
}

function mapScoreRecordToApi(s: ExerciseScoreRecord): Record<string, unknown> {
  return {
    id: s.id,
    exercise_id: s.exerciseId,
    payload_ciphertext_b64: s.payloadCt ? uint8ArrayToBase64(s.payloadCt) : undefined,
    payload_iv_b64: s.payloadIv ? uint8ArrayToBase64(s.payloadIv) : undefined,
  };
}

export const scoreRepository = {
  async getBySubmissionId(
    examId: string,
    submissionId: string,
    key: CryptoKey | null
  ): Promise<ExerciseScoreRecord[]> {
    if (isLocalScoreStore()) {
      const raw = await db.exerciseScores.where('submissionId').equals(submissionId).toArray();
      return Promise.all(raw.map((sc) => decryptScore(sc, key)));
    }
    try {
      const rows = await api.get<any[]>(
        `/exams/${examId}/submissions/${submissionId}/scores`,
        { silentError: true }
      );
      return Promise.all(rows.map((r) => decryptScore(mapApiToScoreRecord(r), key)));
    } catch {
      return [];
    }
  },

  /**
   * Every score in one exam, in a single request.
   *
   * The stats and analytics pages used `db.exerciseScores.toArray()` — every
   * score row in the database, for every exam and every year, decrypted on each
   * render. This is the scoped replacement.
   */
  async getByExamId(examId: string, key: CryptoKey | null): Promise<ExerciseScoreRecord[]> {
    if (isLocalScoreStore()) {
      const submissionIds = (await db.submissions.where('examId').equals(examId).toArray()).map(
        (s) => s.id
      );
      const idSet = new Set(submissionIds);
      const raw = (await db.exerciseScores.toArray()).filter((sc) => idSet.has(sc.submissionId));
      return Promise.all(raw.map((sc) => decryptScore(sc, key)));
    }
    try {
      const rows = await api.get<any[]>(`/exams/${examId}/scores`, { silentError: true });
      return Promise.all(rows.map((r) => decryptScore(mapApiToScoreRecord(r), key)));
    } catch {
      return [];
    }
  },

  /** Every score the workspace holds. Used by cross-exam analytics and export. */
  async getAll(
    examIds: string[],
    key: CryptoKey | null
  ): Promise<ExerciseScoreRecord[]> {
    if (isLocalScoreStore()) {
      const raw = await db.exerciseScores.toArray();
      return Promise.all(raw.map((sc) => decryptScore(sc, key)));
    }
    const perExam = await Promise.all(examIds.map((id) => this.getByExamId(id, key)));
    return perExam.flat();
  },

  /**
   * Write a set of scores for one submission.
   *
   * The server call is a PUT and the row's identity is
   * `(submissionId, exerciseId)`, so a replay from the offline queue updates in
   * place instead of colliding — which is what makes queueing it safe.
   */
  async saveMany(
    examId: string,
    submissionId: string,
    scores: ExerciseScoreRecord[],
    key: CryptoKey | null
  ): Promise<void> {
    if (scores.length === 0) return;
    const sealed = await Promise.all(
      scores.map((s) => encryptScore({ ...s, submissionId }, key))
    );

    if (isLocalScoreStore()) {
      // Reconcile on (submissionId, exerciseId): the pair is the real identity,
      // and a fresh client-side uuid for an exercise already scored would
      // otherwise leave two rows and a double-counted total.
      const existing = await db.exerciseScores.where('submissionId').equals(submissionId).toArray();
      const byExercise = new Map(existing.map((row) => [row.exerciseId, row.id]));
      const rows = sealed.map((row) => ({ ...row, id: byExercise.get(row.exerciseId) ?? row.id }));
      await db.exerciseScores.bulkPut(rows);
      return;
    }

    const payload = { scores: sealed.map(mapScoreRecordToApi) };
    const path = `/exams/${examId}/submissions/${submissionId}/scores`;
    try {
      await api.put(path, payload, { silentError: true });
    } catch {
      enqueueRequest(path, 'PUT', payload);
    }
  },

  async saveOne(
    examId: string,
    score: ExerciseScoreRecord,
    key: CryptoKey | null
  ): Promise<void> {
    await this.saveMany(examId, score.submissionId, [score], key);
  },

  /** Reset one exercise back to ungraded. */
  async deleteOne(examId: string, submissionId: string, exerciseId: string): Promise<void> {
    if (isLocalScoreStore()) {
      await db.exerciseScores
        .where('submissionId')
        .equals(submissionId)
        .and((row) => row.exerciseId === exerciseId)
        .delete();
      return;
    }
    const path = `/exams/${examId}/submissions/${submissionId}/scores/${exerciseId}`;
    try {
      await api.delete(path, { silentError: true });
    } catch {
      enqueueRequest(path, 'DELETE');
    }
  },

  async deleteBySubmissionId(examId: string, submissionId: string): Promise<void> {
    // The local rows are dropped in every mode: in server mode they are a cache
    // of what the server holds, and leaving them behind would resurrect deleted
    // scores the next time a read fell back to Dexie.
    await db.exerciseScores.where('submissionId').equals(submissionId).delete();
    if (isLocalScoreStore()) return;

    const path = `/exams/${examId}/submissions/${submissionId}/scores`;
    try {
      await api.delete(path, { silentError: true });
    } catch {
      enqueueRequest(path, 'DELETE');
    }
  },
};
