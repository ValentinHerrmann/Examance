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
  const status = err?.status ? `HTTP ${err.status}` : 'error';
  const detail = err?.message ? String(err.message) : 'Unknown server error';
  return `${status} — ${detail}`;
}

/**
 * POST `body` to `path`, retrying once under a fresh UUID if the id is taken.
 * Returns the full created record, or null if it failed.
 */
async function createWithIdFallback(
  path: string,
  body: any
): Promise<{ created: any | null; error?: string }> {
  try {
    const res = (await api.post<any>(path, body, { silentError: true })) as any;
    return { created: res ?? { ...body } };
  } catch (err: any) {
    if (err?.status !== 409) {
      return { created: null, error: describeError(err) };
    }
  }

  // 409 — the archived id belongs to a record that already exists on this
  // backend (typically the account the archive was exported from).
  const retryBody = { ...body, id: crypto.randomUUID() };
  try {
    const res = (await api.post<any>(path, retryBody, { silentError: true })) as any;
    return { created: res ?? { ...retryBody } };
  } catch (err: any) {
    return { created: null, error: describeError(err) };
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
  const resources: any[] = Array.isArray(payload.exerciseResources)
    ? payload.exerciseResources
    : [];

  // 1. Exercises first — exams link to them by id.
  //
  // The archived exercise_group_id belongs to the exporting account, and
  // create_exercise rejects a group the caller does not own with a 404. So the
  // group is re-created here instead: the first member of each archived group is
  // sent without one (the backend mints a fresh group), and the id it returns is
  // reused for that group's remaining members. Variant/version grouping survives
  // under ids the importing account owns.
  const groupIdMap = new Map<string, string>();

  for (const ex of exercises) {
    const label = ex.title || ex.name || ex.id;
    const body = mapExerciseRecordToApi(ex);
    const archivedGroupId = ex.exerciseGroupId;

    if (archivedGroupId && groupIdMap.has(archivedGroupId)) {
      body.exercise_group_id = groupIdMap.get(archivedGroupId);
    } else {
      delete body.exercise_group_id;
    }

    const { created, error } = await createWithIdFallback('/exercises', body);
    if (!created?.id) {
      errors.push(`Exercise "${label}": ${error}`);
      continue;
    }

    if (archivedGroupId && !groupIdMap.has(archivedGroupId) && created.exercise_group_id) {
      groupIdMap.set(archivedGroupId, created.exercise_group_id);
    }
    if (ex.id) {
      createdExerciseIds.add(ex.id);
      if (created.id !== ex.id) idMap.set(ex.id, created.id);
    }
  }

  // 1b. Resource files of those exercises. They follow the same id remapping;
  // a rejection is reported but never aborts the rest of the import, since a
  // missing figure is far less costly than a lost exercise.
  for (const res of resources) {
    if (!res?.exerciseId || !createdExerciseIds.has(res.exerciseId)) continue;
    const exerciseId = idMap.get(res.exerciseId) ?? res.exerciseId;
    try {
      await api.post(`/exercises/${exerciseId}/resources`, {
        filename: res.filename,
        mime_type: res.mimeType ?? 'application/octet-stream',
        content_b64: res.dataB64 ?? '',
      });
    } catch (err: any) {
      errors.push(`Resource "${res.filename}": ${describeError(err)}`);
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
    const { created, error } = await createWithIdFallback('/exams', body);
    if (!created?.id) {
      errors.push(`Exam "${label}": ${error}`);
      continue;
    }
    if (exam.id) {
      createdExamIds.add(exam.id);
      if (created.id !== exam.id) idMap.set(exam.id, created.id);
    }
  }

  return { idMap, errors, createdExamIds, createdExerciseIds };
}
