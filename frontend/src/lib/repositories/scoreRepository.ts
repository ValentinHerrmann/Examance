/**
 * Per-exercise grading results. Local in `all-local`/`hybrid` (IndexedDB),
 * server-side in `all-server` (`/exams/{id}/submissions/{id}/scores`). The
 * payload — score, selected options, OMR metadata — is sealed client-side
 * either way; the server only ever stores the ciphertext.
 */

import { api } from '$lib/api/client';
import { db } from '$lib/db/db';
import { resultsAreLocal } from '$lib/stores/storagePolicy';
import { encryptScore, decryptScore } from '$lib/db/dbEncryption';
import { enqueueRequest } from '$lib/services/offlineQueue';
import { uint8ArrayToBase64, base64ToUint8Array } from '$lib/crypto/aesGcm';
import type { ExerciseScoreRecord } from '$lib/db/schema';

const submissionPath = (examId: string, submissionId: string) =>
  `/exams/${examId}/submissions/${submissionId}/scores`;

function fromApi(s: any): ExerciseScoreRecord {
  return {
    id: s.id,
    submissionId: s.submission_id,
    exerciseId: s.exercise_id,
    payloadCt: s.payload_ciphertext_b64 ? base64ToUint8Array(s.payload_ciphertext_b64) : undefined,
    payloadIv: s.payload_iv_b64 ? base64ToUint8Array(s.payload_iv_b64) : undefined,
  };
}

function toApi(s: ExerciseScoreRecord) {
  return {
    id: s.id,
    exercise_id: s.exerciseId,
    payload_ciphertext_b64: s.payloadCt ? uint8ArrayToBase64(s.payloadCt) : undefined,
    payload_iv_b64: s.payloadIv ? uint8ArrayToBase64(s.payloadIv) : undefined,
  };
}

async function openAll(rows: ExerciseScoreRecord[], key: CryptoKey | null) {
  return Promise.all(rows.map((row) => decryptScore(row, key)));
}

/** GET that degrades to "no scores" — callers render an empty grid, not a modal. */
async function fetchScores(path: string, key: CryptoKey | null) {
  try {
    return openAll((await api.get<any[]>(path, { silentError: true })).map(fromApi), key);
  } catch {
    return [];
  }
}

/** Server write with offline-queue fallback. Safe to replay: the endpoints are idempotent. */
async function send(method: 'PUT' | 'DELETE', path: string, body?: unknown) {
  try {
    if (method === 'PUT') await api.put(path, body, { silentError: true });
    else await api.delete(path, { silentError: true });
  } catch {
    enqueueRequest(path, method, body);
  }
}

export const scoreRepository = {
  async getBySubmissionId(examId: string, submissionId: string, key: CryptoKey | null) {
    if (!resultsAreLocal()) return fetchScores(submissionPath(examId, submissionId), key);
    return openAll(await db.exerciseScores.where('submissionId').equals(submissionId).toArray(), key);
  },

  /** Every score in one exam, in one read. */
  async getByExamId(examId: string, key: CryptoKey | null) {
    if (!resultsAreLocal()) return fetchScores(`/exams/${examId}/scores`, key);
    const submissionIds = await db.submissions.where('examId').equals(examId).primaryKeys();
    return openAll(await db.exerciseScores.where('submissionId').anyOf(submissionIds).toArray(), key);
  },

  async getAll(examIds: string[], key: CryptoKey | null) {
    if (resultsAreLocal()) return openAll(await db.exerciseScores.toArray(), key);
    return (await Promise.all(examIds.map((id) => this.getByExamId(id, key)))).flat();
  },

  /**
   * Writes a submission's scores. Rows are identified by
   * (submissionId, exerciseId) in both stores, so a re-save never duplicates.
   */
  async saveMany(
    examId: string,
    submissionId: string,
    scores: ExerciseScoreRecord[],
    key: CryptoKey | null
  ): Promise<void> {
    if (scores.length === 0) return;
    const sealed = await Promise.all(scores.map((s) => encryptScore({ ...s, submissionId }, key)));

    if (!resultsAreLocal()) {
      return send('PUT', submissionPath(examId, submissionId), { scores: sealed.map(toApi) });
    }
    const existing = await db.exerciseScores.where('submissionId').equals(submissionId).toArray();
    const idOf = new Map(existing.map((row) => [row.exerciseId, row.id]));
    await db.exerciseScores.bulkPut(sealed.map((row) => ({ ...row, id: idOf.get(row.exerciseId) ?? row.id })));
  },

  saveOne(examId: string, score: ExerciseScoreRecord, key: CryptoKey | null) {
    return this.saveMany(examId, score.submissionId, [score], key);
  },

  async deleteOne(examId: string, submissionId: string, exerciseId: string): Promise<void> {
    if (!resultsAreLocal()) return send('DELETE', `${submissionPath(examId, submissionId)}/${exerciseId}`);
    await db.exerciseScores
      .where('submissionId')
      .equals(submissionId)
      .and((row) => row.exerciseId === exerciseId)
      .delete();
  },

  /** Local rows go in every mode, so a later fallback read cannot resurrect them. */
  async deleteBySubmissionId(examId: string, submissionId: string): Promise<void> {
    await db.exerciseScores.where('submissionId').equals(submissionId).delete();
    if (!resultsAreLocal()) await send('DELETE', submissionPath(examId, submissionId));
  },
};
