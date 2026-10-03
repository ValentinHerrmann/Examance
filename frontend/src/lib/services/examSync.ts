import { get } from 'svelte/store';
import { api } from '#lib/api/client';
import { db } from '#lib/db/db';
import type { ExamRecord, ExerciseRecord } from '#lib/db/schema';
import { encryptExam, encryptExercise, loadExamsEncrypted } from '#lib/db/dbEncryption';
import { mapApiToExamRecord } from '#lib/repositories/examRepository';
import { mapApiToExerciseRecord } from '#lib/repositories/exerciseRepository';
import { offlineQueue } from '#lib/services/offlineQueue';
import { isServerBacked } from '#lib/utils/serverBacked';

/**
 * The exam list as the dashboard shows it. In server-backed modes the server is authoritative: fetched,
 * mirrored into IndexedDB (exams, exercises, links, MC groups, for offline export), and local leftovers
 * the server no longer knows are purged, except exams still in the offline queue. On a failed fetch the
 * local copy is returned with `failed: true` (all-server caches nothing, so without the flag a rejected
 * request would read as "all my data is gone").
 */
export async function loadSyncedExams(key: CryptoKey | null): Promise<{ exams: ExamRecord[]; failed: boolean }> {
  const localExams = await loadExamsEncrypted(key);

    if (isServerBacked()) {
      try {
        // Silent: the catch below falls back to what is in IndexedDB and the
        // banner reports the failure in place. The global modal on top of that
        // is the same error told twice.
        const remoteExamsRaw = (await api.get('/exams', { silentError: true })) as any[];
        const remoteExams: ExamRecord[] = remoteExamsRaw.map(mapApiToExamRecord);

        // Check offline queue for pending exam creations
        const pendingQueue = get(offlineQueue);
        const pendingExamIds = new Set(
          pendingQueue
            .filter((req) => req.url === '/exams' && req.method === 'POST' && req.body?.id)
            .map((req) => req.body.id)
        );

        // Merge remote and local exams (preserve only local IDB exams pending offline sync)
        const remoteIds = new Set(remoteExams.map((e) => e.id));
        const pendingLocalExams = localExams.filter((e) => !remoteIds.has(e.id) && pendingExamIds.has(e.id));
        const deletedStaleExams = localExams.filter((e) => !remoteIds.has(e.id) && !pendingExamIds.has(e.id));

        // Purge deleted/stale exams from local IDB
        for (const stale of deletedStaleExams) {
          await db.exams.delete(stale.id);
          await db.exercises.where('examId').equals(stale.id).delete();
          await db.examExercises.where('examId').equals(stale.id).delete();
        }

        const exams = [...remoteExams, ...pendingLocalExams];

        const encryptedExams = await Promise.all(exams.map((ex) => encryptExam(ex, key)));
        await db.exams.bulkPut(encryptedExams);


        // Also sync remote exercises, junction records and MC groups to IndexedDB
        // for offline export — nothing else writes these tables in all-server
        // mode, so without this a .bgproj export ships them empty.
        const remoteExercises: ExerciseRecord[] = [];
        const junctionRecords: any[] = [];
        const mcGroupRecords: any[] = [];
        for (const e of remoteExamsRaw) {
          if (Array.isArray(e.mc_groups)) {
            for (const g of e.mc_groups) {
              mcGroupRecords.push({
                id: g.id,
                examId: e.id,
                title: g.title,
                scoringText: g.scoring_text,
                orderIndex: g.order_index,
              });
            }
          }
          if (Array.isArray(e.exercises)) {
            for (let idx = 0; idx < e.exercises.length; idx++) {
              const ex = e.exercises[idx];
              const orderIndex = ex.order_index ?? (idx + 1);
              remoteExercises.push(mapApiToExerciseRecord(ex));
              junctionRecords.push({
                examId: e.id,
                exerciseId: ex.id,
                orderIndex,
                                // MC membership MUST be carried over: junctions are written with bulkPut on the
                                // [examId+exerciseId] key, so one rebuilt without mcGroupId/subIndex overwrites the stored
                                // one, erasing MC group membership (empty group, members shown as standalone exercises).
                mcGroupId: ex.mc_group_id ?? ex.mcGroupId ?? undefined,
                subIndex: ex.sub_index ?? ex.subIndex ?? undefined,
              });
            }
          }
        }
        if (remoteExercises.length > 0) {
          const encExercises = await Promise.all(remoteExercises.map((ex) => encryptExercise(ex, key)));
          await db.exercises.bulkPut(encExercises);
        }
        // Prune before writing: the server is authoritative for these tables in
        // server-backed modes, so a link or group it no longer knows about must
        // not survive locally and resurface as a phantom exercise/group.
        const syncedExamIds = remoteExamsRaw.map((e: any) => e.id).filter(Boolean);
        for (const syncedExamId of syncedExamIds) {
          const keptExerciseIds = new Set(
            junctionRecords.filter((j) => j.examId === syncedExamId).map((j) => j.exerciseId)
          );
          const staleLinks = await db.examExercises.where('examId').equals(syncedExamId).toArray();
          for (const link of staleLinks) {
            if (!keptExerciseIds.has(link.exerciseId)) {
              await db.examExercises.delete([syncedExamId, link.exerciseId]);
            }
          }
          const keptGroupIds = new Set(
            mcGroupRecords.filter((g) => g.examId === syncedExamId).map((g) => g.id)
          );
          const staleGroups = await db.examMcGroups.where('examId').equals(syncedExamId).toArray();
          for (const group of staleGroups) {
            if (!keptGroupIds.has(group.id)) {
              await db.examMcGroups.delete(group.id);
            }
          }
        }
        if (junctionRecords.length > 0) {
          await db.examExercises.bulkPut(junctionRecords);
        }
        if (mcGroupRecords.length > 0) {
          await db.examMcGroups.bulkPut(mcGroupRecords);
        }
        return { exams, failed: false };
      } catch (apiErr) {
        console.warn('Failed to fetch remote exams, falling back to IDB:', apiErr);
                // Local copy plus the `failed` flag: all-server caches nothing, so without the banner a rejected
                // request is indistinguishable from an empty account (a session problem read as "all my data is gone").
        return { exams: localExams, failed: true };
      }
    }
    return { exams: localExams, failed: false };
}
