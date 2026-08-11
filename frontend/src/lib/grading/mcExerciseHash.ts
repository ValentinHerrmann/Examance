/**
 * Hash of an exam's MC/SC/TF answer key, used to detect a stale OMR template
 * (`frontend/src/lib/db/schema.ts`'s `OmrTemplateRecord.exercisesHash`) after
 * an answer-key edit. Shared by the "Prepare OMR" action (exam page) and the
 * scan-ingest staleness check so the two can never disagree on what counts as
 * "changed". Tuples are sorted by exercise id before hashing so the result is
 * independent of traversal order — callers don't need to agree on ordering,
 * only on the underlying exercise set.
 *
 * Deliberately not `ensure64CharHex` (`$lib/crypto/hmac.ts`) — that helper
 * returns its input unhashed if it happens to already be 64 hex chars, which
 * is unacceptable for a hash gating MC auto-scoring correctness.
 */

import type { ExerciseRecord } from '$lib/db/schema';
import { isMcQuestion } from './mcScore';
import {
  loadExamExercisesEncrypted,
  loadExercisesEncrypted,
  loadLocalMcGroups,
  type McGroup,
} from '$lib/db/dbEncryption';

export interface McGroupLike {
  id: string;
  memberIds: string[];
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
  for (const ex of libraryExercises) byId.set(ex.id, ex);
  for (const ex of exercises) byId.set(ex.id, ex);

  const groupMemberIds = new Set<string>();
  for (const group of mcGroups) {
    for (const memberId of group.memberIds) {
      groupMemberIds.add(memberId);
    }
  }

  const result: ExerciseRecord[] = [];
  const addedIds = new Set<string>();

  for (const ex of exercises) {
    if (!groupMemberIds.has(ex.id) && !addedIds.has(ex.id)) {
      result.push(ex);
      addedIds.add(ex.id);
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
}

/** Filters to MC-relevant exercises and reduces each to its answer-key-affecting fields. */
export function toMcAnswerKeyTuples(exercises: ExerciseRecord[]): McAnswerKeyTuple[] {
  return exercises
    .filter(isMcQuestion)
    .map((e) => ({
      id: e.id,
      questionType: e.questionType,
      optionsLength: e.options?.length ?? 0,
      correctAnswers: e.correctAnswers ?? [],
      penalty: e.penalty ?? 0,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** SHA-256 hex digest of the exam's ordered-by-id MC answer-key tuples. */
export async function computeMcExercisesHash(exercises: ExerciseRecord[]): Promise<string> {
  const tuples = toMcAnswerKeyTuples(exercises);
  const data = new TextEncoder().encode(JSON.stringify(tuples));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
