import { get } from 'svelte/store';
import { api } from '#lib/api/client';
import { db } from '#lib/db/db';
import { storagePolicyStore } from '#lib/stores/storagePolicy';
import { decryptExam } from '#lib/db/dbEncryption';
import { enqueueOrThrow } from '#lib/services/offlineQueue';
import type { ExamRecord, ExamExerciseRecord, ExamMcGroupRecord, ExtraNotes } from '#lib/db/schema';
import { invalidateOwner } from '#lib/latex/compileCache';
import { storedEntries, type LatexPackageEntry } from '#lib/latex/packages';

/** Undefined (unknown) stays undefined, so a later save leaves the server's value alone. */
function packagesField(value: unknown): LatexPackageEntry[] | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : storedEntries(value);
}

/** Undefined (unknown) stays undefined so a later save leaves the server's value alone. */
function pageBreaksField(value: unknown): string[] | null | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : null;
}

/** Accepts the API (snake_case) and the local (camelCase) shape; undefined stays undefined. */
function extraNotesField(value: any): ExtraNotes | null | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object') return null;
  return {
    title: String(value.title ?? ''),
    description: String(value.description ?? ''),
    minHeightCm: Number(value.min_height_cm ?? value.minHeightCm),
    maxHeightCm: Number(value.max_height_cm ?? value.maxHeightCm),
  };
}

export function extraNotesToApi(
  value: ExtraNotes | null,
): { title: string; description: string; min_height_cm: number; max_height_cm: number } | null {
  return value ? { title: value.title, description: value.description ?? '', min_height_cm: value.minHeightCm, max_height_cm: value.maxHeightCm } : null;
}

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
    topic: raw.topic ?? undefined,
    lehrernachname: raw.lehrernachname,
    infoText: raw.info_text || raw.infoText,
    gradingKey: raw.grading_key || raw.gradingKey,
    latexPackages: packagesField(raw.latex_packages !== undefined ? raw.latex_packages : raw.latexPackages),
    pageBreaks: pageBreaksField(raw.page_breaks !== undefined ? raw.page_breaks : raw.pageBreaks),
    nameLine: (raw.name_line ?? raw.nameLine) === true,
    mcCorrectionHint: (raw.mc_correction_hint ?? raw.mcCorrectionHint) === true,
    extraNotes: extraNotesField(raw.extra_notes !== undefined ? raw.extra_notes : raw.extraNotes),
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
    // "" clears the stored topic, undefined leaves it alone (the server tells them apart).
    topic: exam.topic,
    lehrernachname: exam.lehrernachname,
    info_text: exam.infoText,
    grading_key: exam.gradingKey,
    // null clears the exam's package override, undefined leaves it alone.
    latex_packages: exam.latexPackages,
    // Empty or null clears the breaks, undefined leaves them alone.
    page_breaks: exam.pageBreaks,
    // Undefined leaves the stored choice alone.
    name_line: exam.nameLine,
    mc_correction_hint: exam.mcCorrectionHint,
    // null switches the block off, undefined leaves it alone.
    extra_notes: exam.extraNotes === undefined ? undefined : extraNotesToApi(exam.extraNotes),
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
    /** An exam's exercise links and MC groups from whichever store owns them. `mapApiToExamRecord` drops `exercises`/`mc_groups` and the local tables can be empty (e.g. after a lock), so this fetches from the server and only falls back to the local mirror when that fails. */
  async getStructure(examId: string): Promise<ExamStructure> {
    const local = async () => ({
      links: await db.examExercises.where('examId').equals(examId).toArray(),
      mcGroups: await db.examMcGroups.where('examId').equals(examId).toArray(),
    });
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
    try {
      // silentError: hybrid falls back to the local copy; otherwise the caller reports the thrown error.
      const rawList = await api.get<any[]>('/exams', { silentError: true });
      return rawList.map(mapApiToExamRecord);
    } catch (err: any) {
      if (policy.storageMode === 'hybrid') {
        const raw = await db.exams.toArray();
        return Promise.all(raw.map((e) => decryptExam(e, key)));
      }
      // all-server holds no local copy: an empty list would pass as "no exams" to export and erasure.
      throw err;
    }
  },

  async getById(id: string, key: CryptoKey | null): Promise<ExamRecord | undefined> {
    if (!db.exams) return undefined;
    try {
      const raw = await api.get<any>(`/exams/${id}`, { silentError: true });
      return mapApiToExamRecord(raw);
    } catch (err: any) {
      const raw = await db.exams.get(id);
      if (raw) return decryptExam(raw, key);
      return undefined;
    }
  },

  async save(exam: ExamRecord, _key: CryptoKey | null): Promise<void> {
    if (!db.exams) return;
    const payload = mapExamRecordToApi(exam);
    if (exam.id) {
      try {
        await api.patch(`/exams/${exam.id}`, payload, { silentError: true });
      } catch (err: any) {
        if (err?.status === 404) {
          try {
            await api.post('/exams', payload, { silentError: true });
          } catch (postErr: any) {
            enqueueOrThrow(postErr, '/exams', 'POST', payload);
          }
        } else {
          enqueueOrThrow(err, `/exams/${exam.id}`, 'PATCH', payload);
        }
      }
    } else {
      try {
        await api.post('/exams', payload, { silentError: true });
      } catch (err: any) {
        enqueueOrThrow(err, '/exams', 'POST', payload);
      }
    }
  },

  /** A brand-new exam with its links in one create-only POST; save() would first probe with a 404ing PATCH. */
  async create(exam: ExamRecord, structure: { exercise_links: unknown[]; mc_groups: unknown[] }): Promise<void> {
    const payload = { ...mapExamRecordToApi(exam), ...structure };
    try {
      await api.post('/exams', payload, { silentError: true });
    } catch (err: any) {
      enqueueOrThrow(err, '/exams', 'POST', payload);
    }
  },

  /** Copies an exam's header, settings and exercise links (never its results) into a new exam. Online-only like the create flow's server round trip; returns the new exam. */
  async duplicate(id: string, retentionDays = 365): Promise<ExamRecord> {
    const retentionUntil = new Date(Date.now() + retentionDays * 86400000).toISOString().slice(0, 10);
    const raw = await api.post<any>(`/exams/${id}/duplicate`, { retention_until: retentionUntil }, { silentError: true });
    return mapApiToExamRecord(raw);
  },

    /** Removes every local table an exam owns. The single implementation for all exam deletions, so no owned table is missed. */
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
    // Server first (F10): a refused delete throws before the local cascade, so nothing is gone on one side only.
    try {
      await api.delete(`/exams/${id}`, { silentError: true });
    } catch (err: any) {
      enqueueOrThrow(err, `/exams/${id}`, 'DELETE');
    }
    await this.deleteLocalCascade(id);
  },
};

