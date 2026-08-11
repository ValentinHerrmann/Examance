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
