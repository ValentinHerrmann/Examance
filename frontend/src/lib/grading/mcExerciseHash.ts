/**
 * Hash of an exam's MC/SC/TF answer key, to detect a stale OMR template after an edit. Tuples are
 * sorted by exercise id. Deliberately not `ensure64CharHex` (`#lib/crypto/hmac.ts`): it returns
 * 64-hex input unhashed, unacceptable for a hash gating MC auto-scoring.
 */

import type { ExerciseRecord } from '#lib/db/schema';
import { isMcQuestion } from './mcScore';
import { parseMcOptions } from '#lib/latex/mcOptions';
import {
  loadExamExercisesEncrypted,
  loadExercisesEncrypted,
  loadLocalMcGroups,
} from '#lib/db/dbEncryption';

export interface McGroupLike {
  id: string;
  memberIds: string[];
}

/**
 * Normalizes an ExerciseRecord so `options` and `correctAnswers` are populated for MC/SC/TF:
 * accepts the backend `{ options, correct }` object and parses `latexBody` via `parseMcOptions`
 * when either is missing.
 */
export function normalizeMcExercise(ex: ExerciseRecord): ExerciseRecord {
  if (!isMcQuestion(ex)) return ex;

  let options: string[] = Array.isArray(ex.options) ? [...ex.options] : [];
  let correctAnswers: number[] = [];

  const rawAnswers = ex.correctAnswers as any;
  if (rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers)) {
    if (Array.isArray(rawAnswers.options) && options.length === 0) {
      options = rawAnswers.options;
    }
    if (Array.isArray(rawAnswers.correct)) {
      correctAnswers = rawAnswers.correct;
    }
  } else if (Array.isArray(rawAnswers)) {
    correctAnswers = rawAnswers;
  }

  if ((options.length === 0 || correctAnswers.length === 0) && ex.latexBody) {
    const parsed = parseMcOptions(ex.latexBody);
    if (parsed.options.length > 0) {
      if (options.length === 0) {
        options = parsed.options.map((o) => o.text);
      }
      if (correctAnswers.length === 0) {
        correctAnswers = parsed.options.flatMap((o, i) => (o.correct ? [i] : []));
      }
    }
  }

  return {
    ...ex,
    options,
    correctAnswers,
  };
}

/**
 * Inverse of `normalizeMcExercise`: the `{ options, correct }` object the backend stores in
 * `correct_answers` (a bare array is rejected with 422). Free-text exercises give `null`.
 */
export function serializeMcAnswers(
  ex: ExerciseRecord
): { options: string[]; correct: number[] } | null {
  if (!isMcQuestion(ex)) return null;
  const normalized = normalizeMcExercise(ex);
  return {
    options: normalized.options ?? [],
    correct: normalized.correctAnswers ?? [],
  };
}

/**
 * Resolves the MC-relevant exercises for an exam given its exercises, library exercises,
 * and MC groups. Deduplicates and unwraps MC group members.
 */
export function resolveMcExercises(
  exercises: ExerciseRecord[],
  libraryExercises: ExerciseRecord[],
  mcGroups: McGroupLike[]
): ExerciseRecord[] {
  const byId = new Map<string, ExerciseRecord>();
  for (const ex of libraryExercises) byId.set(ex.id, normalizeMcExercise(ex));
  for (const ex of exercises) byId.set(ex.id, normalizeMcExercise(ex));

  const groupMemberIds = new Set<string>();
  for (const group of mcGroups) {
    for (const memberId of group.memberIds) {
      groupMemberIds.add(memberId);
    }
  }

  const result: ExerciseRecord[] = [];
  const addedIds = new Set<string>();

  for (const ex of exercises) {
    const normalized = normalizeMcExercise(ex);
    if (!groupMemberIds.has(normalized.id) && !addedIds.has(normalized.id)) {
      result.push(normalized);
      addedIds.add(normalized.id);
    }
  }

  for (const group of mcGroups) {
    for (const memberId of group.memberIds) {
      if (!addedIds.has(memberId)) {
        const member = byId.get(memberId);
        if (member) {
          result.push(member);
          addedIds.add(memberId);
        }
      }
    }
  }

  return result.filter(isMcQuestion);
}

/**
 * Loads exam exercises, library exercises, and local MC groups from IndexedDB,
 * then returns the resolved MC-relevant exercises for the exam.
 */
export async function loadExamMcExercises(
  examId: string,
  key: CryptoKey | null
): Promise<ExerciseRecord[]> {
  const [exercises, libraryExercises, mcGroups] = await Promise.all([
    loadExamExercisesEncrypted(examId, key),
    (async () => {
      try {
        return await loadExercisesEncrypted(key);
      } catch {
        return [];
      }
    })(),
    loadLocalMcGroups(examId),
  ]);
  return resolveMcExercises(exercises, libraryExercises, mcGroups);
}

interface McAnswerKeyTuple {
  id: string;
  questionType: string;
  optionsLength: number;
  correctAnswers: number[];
  penalty: number;
    /** `<groupId>:<position>` for MC group members: position decides box placement, so reordering must invalidate the OMR template. Absent for standalone exercises (hash unchanged). */
  groupSlot?: string;
}

/** Filters to MC-relevant exercises and reduces each to its answer-key-affecting fields. */
export function toMcAnswerKeyTuples(
  exercises: ExerciseRecord[],
  mcGroups: McGroupLike[] = []
): McAnswerKeyTuple[] {
  const slotById = new Map<string, string>();
  for (const group of mcGroups) {
    group.memberIds.forEach((memberId, idx) => slotById.set(memberId, `${group.id}:${idx}`));
  }
  const exs = exercises
    .filter(isMcQuestion)
    .map(normalizeMcExercise)
    .map((e) => ({
      id: e.id,
      questionType: e.questionType,
      optionsLength: e.options?.length ?? 0,
      correctAnswers: e.correctAnswers ?? [],
      penalty: e.penalty ?? 0,
      ...(slotById.has(e.id) ? { groupSlot: slotById.get(e.id) } : {}),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return exs;
}

/** SHA-256 hex digest of the exam's ordered-by-id MC answer-key tuples (incl. group slots). */
export async function computeMcExercisesHash(
  exercises: ExerciseRecord[],
  mcGroups: McGroupLike[] = []
): Promise<string> {
  const tuples = toMcAnswerKeyTuples(exercises, mcGroups);
  const data = new TextEncoder().encode(JSON.stringify(tuples));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
