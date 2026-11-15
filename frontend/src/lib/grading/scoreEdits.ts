/** The grading panel's score edits (type, reset) on `gradingStore`, shared by the score list and the objection dialog. */

import type { ExerciseRecord } from '#lib/db/schema';
import { gradingStore } from './gradingStore';
import { partOverrideKey } from './partScores';

/** Types the exercise total (a manual override of the parts). */
export function setTotal(ex: ExerciseRecord, value: number | null): void {
  gradingStore.setManualOverrideFlag(ex.id, true);
  gradingStore.setScoreInput(ex.id, value);
}

export function setPart(ex: ExerciseRecord, key: string, value: number | null): void {
  gradingStore.setManualOverrideFlag(partOverrideKey(ex.id, key), true);
  gradingStore.setPartInput(ex, key, value);
}

export function resetPart(ex: ExerciseRecord, key: string): void {
  gradingStore.setPartInput(ex, key, null);
  gradingStore.setManualOverrideFlag(partOverrideKey(ex.id, key), false);
}

/** Clears the exercise with all of its parts. */
export function resetExercise(ex: ExerciseRecord): void {
  const state = gradingStore.getState();
  const { [ex.id]: _dropped, ...partInputs } = state.partInputs;
  const prefix = partOverrideKey(ex.id, '');
  gradingStore.setPartInputs(partInputs);
  gradingStore.setManualOverride(Object.fromEntries(Object.entries(state.manualOverride).filter(([k]) => !k.startsWith(prefix))));
  gradingStore.setScoreInput(ex.id, null);
  gradingStore.setManualOverrideFlag(ex.id, false);
}

/** "Q2 b)" — the short name of an exercise row. */
export function exerciseTag(ex: ExerciseRecord): string {
  return `Q${ex.orderIndex}${ex.subIndex ? `\u00a0${String.fromCharCode(96 + ex.subIndex)})` : ''}`;
}
