/**
 * Create the contents of an imported .bgproj archive on the server.
 *
 * Import must work for anyone with the archive password, whichever account exported it, so the
 * `examRepository.save()` path is out: it PATCHes when a record has an id, and the backend answers
 * 401 (not 404) for another account's exam, so its create-fallback never fires. Everything is POSTed.
 *
 * Archived UUIDs are reused so references survive, but ids are globally unique: an archive from
 * another account on the same server may carry taken ids. Those 409, get one retry under a fresh
 * UUID, and `idMap` records the substitution so links, submissions and scores follow.
 *
 * Exercises the account can already read on the server (its own, or another teacher's shared one)
 * are linked rather than copied. Every request is silent; outcomes go into the `ArchiveReport`.
 */

import { api } from '#lib/api/client';
import { mapExamRecordToApi } from '#lib/repositories/examRepository';
import { mapExerciseRecordToApi } from '#lib/repositories/exerciseRepository';
import type { ExamRecord, ExerciseRecord } from '#lib/db/schema';
import { addMissing, bump, type ArchiveReport } from './report';

export interface ServerImportResult {
  /** Archived id → id actually created on the server. Only differing ids are listed. */
  idMap: Map<string, string>;
  /** Archived MC group id → the fresh id it was created under. */
  mcGroupIdMap: Map<string, string>;
  /** Human-readable failures; import continues past each one. */
  errors: string[];
  /** Archived exam ids that were created successfully. */
  createdExamIds: Set<string>;
  /** Archived exercise ids that were created successfully. */
  createdExerciseIds: Set<string>;
  /** Archived exam id → archived exercise ids actually linked to it (created or reused). */
  linkedExercisesByExam: Map<string, Set<string>>;
}

export interface ServerImportOptions {
  report: ArchiveReport;
  /** Exercises the user chose to take from the archive over the existing one: always created. */
  takeImportedIds?: Set<string>;
}

function describeError(err: any): string {
  const status = err?.status ? `HTTP ${err.status}` : 'error';
  const detail = err?.message ? String(err.message) : 'Unknown server error';
  return `${status} — ${detail}`;
}

/** POST `body` to `path`, retrying once under a fresh UUID if the id is taken. Returns the created record or null. */
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

/** True when this account can read (and therefore link) the exercise on the server: own or shared. */
async function exerciseAvailable(id: string): Promise<boolean> {
  try {
    await api.get(`/exercises/${id}`, { silentError: true });
    return true;
  } catch {
    return false;
  }
}

export async function importPayloadToServer(
  payload: any,
  { report, takeImportedIds = new Set() }: ServerImportOptions
): Promise<ServerImportResult> {
  const idMap = new Map<string, string>();
  const errors: string[] = [];
  const createdExamIds = new Set<string>();
  const createdExerciseIds = new Set<string>();
  /** Archived exercise ids that exist on the server already and are linked as they are. */
  const reusedExerciseIds = new Set<string>();
  const linkedExercisesByExam = new Map<string, Set<string>>();

  const exercises: ExerciseRecord[] = Array.isArray(payload.exercises) ? payload.exercises : [];
  const exams: ExamRecord[] = Array.isArray(payload.exams) ? payload.exams : [];
  const junctions: any[] = Array.isArray(payload.exerciseExams) ? payload.exerciseExams : [];
  const mcGroups: any[] = Array.isArray(payload.examMcGroups) ? payload.examMcGroups : [];
  const resources: any[] = Array.isArray(payload.exerciseResources)
    ? payload.exerciseResources
    : [];
  const exerciseName = new Map(exercises.map((ex) => [ex.id, ex.name || ex.title || ex.id]));

    // 1. Exercises first (exams link to them by id). The archived exercise_group_id belongs to the
    // exporting account and create_exercise 404s on a group the caller doesn't own, so groups are
    // re-created: the first member of each group is sent without one (backend mints it) and the
    // returned id is reused for the rest. Variant/version grouping survives under owned ids.
  const groupIdMap = new Map<string, string>();

  for (const ex of exercises) {
    const label = ex.title || ex.name || ex.id;

    // Already on the server for this account (its own, or shared by another teacher): link it.
    if (ex.id && !takeImportedIds.has(ex.id) && (await exerciseAvailable(ex.id))) {
      reusedExerciseIds.add(ex.id);
      bump(report, 'exercises', 'linked');
      continue;
    }

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
      bump(report, 'exercises', 'failed');
      continue;
    }

    if (archivedGroupId && !groupIdMap.has(archivedGroupId) && created.exercise_group_id) {
      groupIdMap.set(archivedGroupId, created.exercise_group_id);
    }
    if (ex.id) {
      createdExerciseIds.add(ex.id);
      if (created.id !== ex.id) idMap.set(ex.id, created.id);
    }
    bump(report, 'exercises', ex.id && created.id !== ex.id ? 'newId' : 'created');
  }

  // 1b. Resource files of those exercises. They follow the same id remapping;
  // a rejection is reported but never aborts the rest of the import, since a
  // missing figure is far less costly than a lost exercise.
  for (const res of resources) {
    if (!res?.exerciseId || !createdExerciseIds.has(res.exerciseId)) continue;
    const exerciseId = idMap.get(res.exerciseId) ?? res.exerciseId;
    try {
      await api.post(
        `/exercises/${exerciseId}/resources`,
        {
          filename: res.filename,
          mime_type: res.mimeType ?? 'application/octet-stream',
          content_b64: res.dataB64 ?? '',
        },
        { silentError: true }
      );
      bump(report, 'resources', 'created');
    } catch (err: any) {
      errors.push(`Resource "${res.filename}": ${describeError(err)}`);
      bump(report, 'resources', 'failed');
    }
  }

  // 1c. Links to exercises the archive does not carry (e.g. a shared exercise of another teacher):
  // reuse them when this account can read them on the server.
  const archivedExerciseIds = new Set(exercises.map((ex) => ex.id));
  for (const id of new Set(junctions.map((j) => j.exerciseId as string))) {
    if (archivedExerciseIds.has(id) || reusedExerciseIds.has(id)) continue;
    if (await exerciseAvailable(id)) {
      reusedExerciseIds.add(id);
      bump(report, 'exercises', 'linked');
    }
  }
  const linkable = (id: string) => createdExerciseIds.has(id) || reusedExerciseIds.has(id);

    // 2. Exams with exercise links and MC groups inline (POST /exams persists all three).
    // MC group ids are client-chosen and meaningless beyond linking, so they're re-minted per
    // import to avoid 409s on re-import; members follow through this map.
  const mcGroupIdMap = new Map<string, string>();
  for (const group of mcGroups) {
    mcGroupIdMap.set(group.id, crypto.randomUUID());
  }

  for (const exam of exams) {
    const label = exam.title || exam.id;
    const examLinks = junctions.filter((j) => j.examId === exam.id);
    for (const j of examLinks) {
      if (!linkable(j.exerciseId)) {
        addMissing(report, {
          reason: 'exerciseUnavailable',
          exam: label,
          item: exerciseName.get(j.exerciseId) ?? j.exerciseId,
        });
      }
    }

    const exercise_links = examLinks
      .filter((j) => linkable(j.exerciseId))
      .map((j) => ({
        exercise_id: idMap.get(j.exerciseId) ?? j.exerciseId,
        order_index: j.orderIndex ?? 1,
        mc_group_id: j.mcGroupId ? (mcGroupIdMap.get(j.mcGroupId) ?? j.mcGroupId) : undefined,
        sub_index: j.subIndex,
      }));

    const mc_groups = mcGroups
      .filter((g) => g.examId === exam.id)
      .map((g) => ({
        id: mcGroupIdMap.get(g.id) ?? g.id,
        title: g.title,
        scoring_text: g.scoringText,
        order_index: g.orderIndex ?? 1,
      }));

    const body = { ...mapExamRecordToApi(exam), exercise_links, mc_groups };
    const { created, error } = await createWithIdFallback('/exams', body);
    if (!created?.id) {
      errors.push(`Exam "${label}": ${error}`);
      bump(report, 'exams', 'failed');
      continue;
    }
    if (exam.id) {
      createdExamIds.add(exam.id);
      if (created.id !== exam.id) idMap.set(exam.id, created.id);
      linkedExercisesByExam.set(exam.id, new Set(examLinks.filter((j) => linkable(j.exerciseId)).map((j) => j.exerciseId)));
    }
    bump(report, 'exams', exam.id && created.id !== exam.id ? 'newId' : 'created');
    bump(report, 'mcGroups', 'created', mc_groups.length);
  }

  return { idMap, mcGroupIdMap, errors, createdExamIds, createdExerciseIds, linkedExercisesByExam };
}
