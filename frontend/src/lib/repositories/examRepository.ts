import { get } from 'svelte/store';
import { api } from '$lib/api/client';
import { db } from '$lib/db/db';
import { storagePolicyStore } from '$lib/stores/storagePolicy';
import { encryptExam, decryptExam } from '$lib/db/dbEncryption';
import { enqueueRequest } from '$lib/services/offlineQueue';
import type { ExamRecord, ExamExerciseRecord, ExamMcGroupRecord } from '$lib/db/schema';
import { invalidateOwner } from '$lib/latex/compileCache';

export function mapApiToExamRecord(raw: any): ExamRecord {
  return {
    id: raw.id,
    teacherId: raw.teacher_id || raw.teacherId || '',
    title: raw.title,
    testart: raw.testart,
    grade: raw.grade,
    klasse: raw.klasse,
    datum: raw.datum,
    nr: raw.nr,
    fach: raw.fach,
    lehrernachname: raw.lehrernachname,
    infoText: raw.info_text || raw.infoText,
    gradingKey: raw.grading_key || raw.gradingKey,
    latexPreamble: raw.latex_preamble || raw.latexPreamble,
    latexTemplate: raw.latex_template || raw.latexTemplate,
    numVersions: raw.num_versions || raw.numVersions || 1,
    retentionUntil: raw.retention_until || raw.retentionUntil || new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
    compilationStatus: raw.compilation_status || raw.compilationStatus || 'pending',
    createdAt: raw.created_at || raw.createdAt || new Date().toISOString(),
  };
}

export function mapExamRecordToApi(exam: ExamRecord): any {
  return {
    id: exam.id,
    title: exam.title || 'Unbenannte Prüfung',
    testart: exam.testart,
    grade: exam.grade,
    klasse: exam.klasse,
    datum: exam.datum,
    nr: exam.nr,
    fach: exam.fach,
    lehrernachname: exam.lehrernachname,
    info_text: exam.infoText,
    grading_key: exam.gradingKey,
    latex_preamble: exam.latexPreamble,
    latex_template: exam.latexTemplate,
    retention_until: exam.retentionUntil,
  };
}

export interface ExamStructure {
  links: ExamExerciseRecord[];
  mcGroups: ExamMcGroupRecord[];
}

export const examRepository = {
  /**
   * An exam's exercise links and MC groups, from whichever store owns them.
   * `mapApiToExamRecord` drops `exercises`/`mc_groups`, and in `all-server`
   * mode the local `examExercises`/`examMcGroups` tables can be empty (e.g.
   * after a lock), so this fetches from the server there instead.
   */
  async getStructure(examId: string): Promise<ExamStructure> {
    const local = async () => ({
      links: await db.examExercises.where('examId').equals(examId).toArray(),
      mcGroups: await db.examMcGroups.where('examId').equals(examId).toArray(),
    });
    if (get(storagePolicyStore).storageMode === 'all-local') return local();

    try {
      const remote = (await api.get<any>(`/exams/${examId}`, { silentError: true })) as any;
      return {
        links: (remote.exercises ?? []).map((e: any, idx: number) => ({
          examId,
          exerciseId: e.id,
          orderIndex: e.order_index ?? idx + 1,
          mcGroupId: e.mc_group_id ?? undefined,
          subIndex: e.sub_index ?? undefined,
        })),
        mcGroups: (remote.mc_groups ?? []).map((g: any, idx: number) => ({
          id: g.id,
          examId,
          title: g.title,
          scoringText: g.scoring_text,
          orderIndex: g.order_index ?? idx + 1,
        })),
      };
    } catch {
      // Hybrid keeps a usable local mirror; all-server has nothing better.
      return local();
    }
  },

  async getAll(key: CryptoKey | null): Promise<ExamRecord[]> {
    const policy = get(storagePolicyStore);
    if (!db.exams) return [];
    if (policy.storageMode === 'all-local') {
      const raw = await db.exams.toArray();
      return Promise.all(raw.map((e) => decryptExam(e, key)));
    } else {
      try {
        // silentError: every failure here falls back to the local copy, so the
        // global HTTP error modal would fire for an outcome the user never sees.
        const rawList = await api.get<any[]>('/exams', { silentError: true });
        return rawList.map(mapApiToExamRecord);
      } catch (err: any) {
        if (policy.storageMode === 'hybrid') {
          const raw = await db.exams.toArray();
          return Promise.all(raw.map((e) => decryptExam(e, key)));
        }
        return [];
      }
    }
  },

  async getById(id: string, key: CryptoKey | null): Promise<ExamRecord | undefined> {
    const policy = get(storagePolicyStore);
    if (!db.exams) return undefined;
    if (policy.storageMode === 'all-local') {
      const raw = await db.exams.get(id);
      if (!raw) return undefined;
      return decryptExam(raw, key);
    } else {
      try {
        const raw = await api.get<any>(`/exams/${id}`, { silentError: true });
        return mapApiToExamRecord(raw);
      } catch (err: any) {
        const raw = await db.exams.get(id);
        if (raw) return decryptExam(raw, key);
        return undefined;
      }
    }
  },

  async save(exam: ExamRecord, key: CryptoKey | null): Promise<void> {
    const policy = get(storagePolicyStore);
    if (!db.exams) return;
    if (policy.storageMode === 'all-local') {
      const encrypted = await encryptExam(exam, key);
      await db.exams.put(encrypted);
    } else {
      const payload = mapExamRecordToApi(exam);
      if (exam.id) {
        try {
          await api.patch(`/exams/${exam.id}`, payload, { silentError: true });
        } catch (err: any) {
          if (err?.status === 404) {
            try {
              await api.post('/exams', payload, { silentError: true });
            } catch (postErr: any) {
              enqueueRequest('/exams', 'POST', payload);
            }
          } else {
            enqueueRequest(`/exams/${exam.id}`, 'PATCH', payload);
          }
        }
      } else {
        try {
          await api.post('/exams', payload, { silentError: true });
        } catch (err: any) {
          enqueueRequest('/exams', 'POST', payload);
        }
      }
    }
  },

  /**
   * Removes every local table an exam owns. Single implementation, used by
   * every caller that deletes an exam, so no owned table is missed.
   */
  async deleteLocalCascade(id: string): Promise<void> {
    if (!db.exams) return;

    const submissionIds = (await db.submissions.where('examId').equals(id).toArray()).map(
      (s) => s.id
    );
    const exerciseIds = (await db.exercises.where('examId').equals(id).toArray()).map((e) => e.id);

    await db.transaction(
      'rw',
      [
        db.exams,
        db.exercises,
        db.examExercises,
        db.examMcGroups,
        db.submissions,
        db.students,
        db.exerciseScores,
        db.exerciseResources,
        db.omrTemplates,
      ],
      async () => {
        for (const subId of submissionIds) {
          await db.exerciseScores.where('submissionId').equals(subId).delete();
        }
        // Resource files hang off the exercises that are about to disappear.
        for (const exerciseId of exerciseIds) {
          await db.exerciseResources.where('exerciseId').equals(exerciseId).delete();
        }
        await db.exams.delete(id);
        await db.exercises.where('examId').equals(id).delete();
        await db.examExercises.where('examId').equals(id).delete();
        await db.examMcGroups.where('examId').equals(id).delete();
        await db.submissions.where('examId').equals(id).delete();
        await db.students.where('examId').equals(id).delete();
        await db.omrTemplates.delete(id); // id === examId (one template per exam)
      }
    );
  },

  async delete(id: string): Promise<void> {
    invalidateOwner('exam', id);
    invalidateOwner('omr-blank', id);

    await this.deleteLocalCascade(id);

    const policy = get(storagePolicyStore);
    if (policy.storageMode !== 'all-local') {
      try {
        await api.delete(`/exams/${id}`, { silentError: true });
      } catch (err: any) {
        enqueueRequest(`/exams/${id}`, 'DELETE');
      }
    }
  },
};

