/** Exam statistics records (issue #238): always on the server, in every storage mode, sealed client-side; the server never reads a value. */
import { api } from '#lib/api/client';
import { base64ToUint8Array, uint8ArrayToBase64 } from '#lib/crypto/aesGcm';
import { openExamStatistics, sealExamStatistics } from '#lib/db/dbEncryption';
import { enqueueOrThrow } from '#lib/services/offlineQueue';
import { STATISTICS_SNAPSHOT_VERSION, type StatisticsSnapshot } from '#lib/analytics/statisticsSnapshot';

interface StatisticsRow {
  id: string;
  exam_id: string;
  keep_after_exam_delete: boolean;
  computed_at: string;
  updated_at: string;
  payload_ciphertext_b64: string;
  payload_iv_b64: string;
}

export interface StoredStatistics {
  id: string;
  examId: string;
  keepAfterExamDelete: boolean;
  snapshot: StatisticsSnapshot;
}

async function open(row: StatisticsRow, key: CryptoKey | null): Promise<StoredStatistics | null> {
  try {
    const snapshot = await openExamStatistics<StatisticsSnapshot>(row.exam_id, base64ToUint8Array(row.payload_ciphertext_b64), base64ToUint8Array(row.payload_iv_b64), key);
    if (snapshot?.v !== STATISTICS_SNAPSHOT_VERSION || snapshot.exam?.id !== row.exam_id) return null;
    return { id: row.id, examId: row.exam_id, keepAfterExamDelete: row.keep_after_exam_delete, snapshot };
  } catch (err) {
    console.warn(`[statistics] record of exam ${row.exam_id} did not open:`, err);
    return null;
  }
}

export const statisticsRepository = {
  /** Every record of the account, those of deleted exams included; a record that does not open is skipped (logged). Throws on a failed read. */
  async list(key: CryptoKey | null): Promise<StoredStatistics[]> {
    const rows = await api.get<StatisticsRow[]>('/statistics', { silentError: true });
    const opened = await Promise.all((rows ?? []).map((row) => open(row, key)));
    return opened.filter((r): r is StoredStatistics => r !== null);
  },

  /** The exam's record, or null when it has none. Throws on a failed read. */
  async findByExam(examId: string, key: CryptoKey | null): Promise<StoredStatistics | null> {
    const row = await api.get<StatisticsRow | null>(`/exams/${examId}/statistics`, { silentError: true });
    return row ? open(row, key) : null;
  },

  /** Idempotent upsert; the server ignores a replayed write built well before the stored record. */
  async put(snapshot: StatisticsSnapshot, key: CryptoKey | null): Promise<void> {
    const { ct, iv } = await sealExamStatistics(snapshot.exam.id, snapshot, key);
    const path = `/exams/${snapshot.exam.id}/statistics`;
    const body = { computed_at: snapshot.computedAt, payload_ciphertext_b64: uint8ArrayToBase64(ct), payload_iv_b64: uint8ArrayToBase64(iv) };
    try {
      await api.put(path, body, { silentError: true });
    } catch (err) {
      // The exam was deleted meanwhile: nothing to keep statistics for.
      if ((err as { status?: number })?.status === 404) return;
      enqueueOrThrow(err, path, 'PUT', body);
    }
  },

  async setKeep(id: string, keepAfterExamDelete: boolean): Promise<void> {
    // The delete dialogs report a failure inline.
    await api.patch(`/statistics/${id}`, { keep_after_exam_delete: keepAfterExamDelete }, { silentError: true });
  },

  async delete(id: string): Promise<void> {
    const path = `/statistics/${id}`;
    try {
      await api.delete(path, { silentError: true });
    } catch (err) {
      enqueueOrThrow(err, path, 'DELETE');
    }
  },
};
