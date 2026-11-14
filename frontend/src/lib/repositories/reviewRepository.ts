/** Grading review threads (issue #226): IndexedDB in `hybrid`, server-side in `all-server` (`/exams/{id}/submissions/{id}/grading-review`). One record per submission, sealed as one payload; the server only stores ciphertext. */

import { api } from '#lib/api/client';
import { db } from '#lib/db/db';
import { resultsAreLocal } from '#lib/stores/storagePolicy';
import { encryptReview, decryptReview } from '#lib/db/dbEncryption';
import { enqueueOrThrow } from '#lib/services/offlineQueue';
import { uint8ArrayToBase64, base64ToUint8Array } from '#lib/crypto/aesGcm';
import type { GradingReviewRecord } from '#lib/db/schema';

const submissionPath = (examId: string, submissionId: string) =>
  `/exams/${examId}/submissions/${submissionId}/grading-review`;

export function fromApi(r: any): GradingReviewRecord {
  return {
    id: r.id,
    submissionId: r.submission_id,
    items: [],
    submittedAt: null,
    repliedAt: null,
    payloadCt: r.payload_ciphertext_b64 ? base64ToUint8Array(r.payload_ciphertext_b64) : undefined,
    payloadIv: r.payload_iv_b64 ? base64ToUint8Array(r.payload_iv_b64) : undefined,
  };
}

export function toApi(r: GradingReviewRecord) {
  return {
    id: r.id,
    payload_ciphertext_b64: r.payloadCt ? uint8ArrayToBase64(r.payloadCt) : undefined,
    payload_iv_b64: r.payloadIv ? uint8ArrayToBase64(r.payloadIv) : undefined,
  };
}

/** A failed GET throws, never reads as "no review". */
async function fetchAll(path: string, key: CryptoKey | null) {
  const rows = (await api.get<any[]>(path, { silentError: true })).map(fromApi);
  return Promise.all(rows.map((row) => decryptReview(row, key)));
}

export const reviewRepository = {
  /** The submission's review, or null when it has none. */
  async getBySubmission(examId: string, submissionId: string, key: CryptoKey | null): Promise<GradingReviewRecord | null> {
    if (resultsAreLocal()) {
      const row = await db.gradingReviews.where('submissionId').equals(submissionId).first();
      return row ? decryptReview(row, key) : null;
    }
    // The server answers 200 with JSON null for a submission without a review.
    const raw = await api.get<any>(submissionPath(examId, submissionId), { silentError: true });
    return raw ? decryptReview(fromApi(raw), key) : null;
  },

  async listByExam(examId: string, key: CryptoKey | null): Promise<GradingReviewRecord[]> {
    if (!resultsAreLocal()) return fetchAll(`/exams/${examId}/grading-reviews`, key);
    const submissionIds = await db.submissions.where('examId').equals(examId).primaryKeys();
    const rows = await db.gradingReviews.where('submissionId').anyOf(submissionIds).toArray();
    return Promise.all(rows.map((row) => decryptReview(row, key)));
  },

  /** Idempotent upsert, one record per submission: an existing record's id is kept in both stores. */
  async save(examId: string, review: GradingReviewRecord, key: CryptoKey | null): Promise<void> {
    const sealed = await encryptReview(review, key);
    if (!resultsAreLocal()) {
      const path = submissionPath(examId, review.submissionId);
      try {
        await api.put(path, toApi(sealed), { silentError: true });
      } catch (err) {
        enqueueOrThrow(err, path, 'PUT', toApi(sealed));
      }
      return;
    }
    const existing = await db.gradingReviews.where('submissionId').equals(review.submissionId).first();
    await db.gradingReviews.put({ ...sealed, id: existing?.id ?? sealed.id });
  },
};
