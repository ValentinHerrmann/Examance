/**
 * Create the contents of an imported .bgproj archive on the server.
 *
 * Import must work for anyone holding the archive password, regardless of which
 * account exported it. That rules out the normal `examRepository.save()` path:
 * it PATCHes when the record carries an id, and the backend answers 401 (not
 * 404) for an exam owned by somebody else, so its create-fallback never fires.
 * Everything here is therefore created explicitly with POST.
 *
 * Archived UUIDs are reused so cross-references survive, but ids are globally
 * unique on the backend — an archive exported from another account on the *same*
 * server carries ids that are already taken. Those come back as 409, and the
 * record is retried once under a fresh UUID; `idMap` records the substitution so
 * links, submissions and scores can be rewritten to match.
 */

import { api } from '$lib/api/client';
import { mapExamRecordToApi } from '$lib/repositories/examRepository';
import { mapExerciseRecordToApi } from '$lib/repositories/exerciseRepository';
import type { ExamRecord, ExerciseRecord } from '$lib/db/schema';

export interface ServerImportResult {
  /** Archived id → id actually created on the server. Only differing ids are listed. */
  idMap: Map<string, string>;
  /** Human-readable failures; import continues past each one. */
  errors: string[];
  /** Archived exam ids that were created successfully. */
  createdExamIds: Set<string>;
  /** Archived exercise ids that were created successfully. */
  createdExerciseIds: Set<string>;
}

function describeError(err: any): string {
  if (err?.message) return String(err.message);
  return 'Unknown server error';
}

/**
 * POST `body` to `path`, retrying once under a fresh UUID if the id is taken.
 * Returns the id the server actually created, or null if the record failed.
 */
async function createWithIdFallback(
  path: string,
  body: any
): Promise<{ id: string | null; error?: string }> {
  try {
    const res = (await api.post<any>(path, body, { silentError: true })) as any;
    return { id: res?.id ?? body.id ?? null };
  } catch (err: any) {
    if (err?.status !== 409) {
      return { id: null, error: describeError(err) };
    }
  }

  // 409 — the archived id belongs to a record that already exists on this
  // backend (typically the account the archive was exported from).
  const retryBody = { ...body, id: crypto.randomUUID() };
  try {
    const res = (await api.post<any>(path, retryBody, { silentError: true })) as any;
    return { id: res?.id ?? retryBody.id };
  } catch (err: any) {
    return { id: null, error: describeError(err) };
  }
}

export async function importPayloadToServer(payload: any): Promise<ServerImportResult> {
  const idMap = new Map<string, string>();
  const errors: string[] = [];
  const createdExamIds = new Set<string>();
  const createdExerciseIds = new Set<string>();

  const exercises: ExerciseRecord[] = Array.isArray(payload.exercises) ? payload.exercises : [];
  const exams: ExamRecord[] = Array.isArray(payload.exams) ? payload.exams : [];
  const junctions: any[] = Array.isArray(payload.exerciseExams) ? payload.exerciseExams : [];
  const mcGroups: any[] = Array.isArray(payload.examMcGroups) ? payload.examMcGroups : [];

  // 1. Exercises first — exams link to them by id.
  for (const ex of exercises) {
    const label = ex.title || ex.name || ex.id;
    const { id, error } = await createWithIdFallback('/exercises', mapExerciseRecordToApi(ex));
    if (!id) {
      errors.push(`Exercise "${label}": ${error}`);
      continue;
    }
    if (ex.id) {
      createdExerciseIds.add(ex.id);
      if (id !== ex.id) idMap.set(ex.id, id);
    }
  }

  // 2. Exams, carrying their exercise links and MC groups inline — POST /exams
  // persists all three in one request.
  for (const exam of exams) {
    const label = exam.title || exam.id;

    const exercise_links = junctions
      .filter((j) => j.examId === exam.id && createdExerciseIds.has(j.exerciseId))
      .map((j) => ({
        exercise_id: idMap.get(j.exerciseId) ?? j.exerciseId,
        order_index: j.orderIndex ?? 1,
        mc_group_id: j.mcGroupId,
        sub_index: j.subIndex,
      }));

    const mc_groups = mcGroups
      .filter((g) => g.examId === exam.id)
      .map((g) => ({
        id: g.id,
        title: g.title,
        scoring_text: g.scoringText,
        order_index: g.orderIndex ?? 1,
      }));

    const body = { ...mapExamRecordToApi(exam), exercise_links, mc_groups };
    const { id, error } = await createWithIdFallback('/exams', body);
    if (!id) {
      errors.push(`Exam "${label}": ${error}`);
      continue;
    }
    if (exam.id) {
      createdExamIds.add(exam.id);
      if (id !== exam.id) idMap.set(exam.id, id);
    }
  }

  return { idMap, errors, createdExamIds, createdExerciseIds };
}
