/** The stamp targets in grading order (issue #330): what the exercise stepper walks; an exercise with parts is graded only through its parts. */

import type { ExerciseRecord } from "#lib/db/schema";
import { gradingStore } from "./gradingStore";
import { exerciseParts, REST_KEY, restMax } from "./partScores";
import { exerciseTag } from "./scoreEdits";
import { translate } from "#lib/i18n";

export interface GradingTarget {
  exercise: ExerciseRecord;
  /** "" for a whole exercise or the rest of one with parts (the stamp target of the points outside the parts), else the part letter. */
  partLabel: string;
  /** Key the score is stored under in `partInputs`: the part letter, `REST_KEY`, or null for a whole exercise. */
  partKey: string | null;
  max: number;
}

export function gradingTargets(exercises: ExerciseRecord[]): GradingTarget[] {
  return exercises.flatMap((exercise): GradingTarget[] => {
    const parts = exerciseParts(exercise);
    if (parts.length === 0) return [{ exercise, partLabel: "", partKey: null, max: exercise.maxPoints }];
    const targets: GradingTarget[] = parts.map((p) => ({ exercise, partLabel: p.label, partKey: p.label, max: p.max }));
    const rest = restMax(exercise);
    if (rest > 0) targets.push({ exercise, partLabel: "", partKey: REST_KEY, max: rest });
    return targets;
  });
}

/** Index of the active target; an empty label on an exercise with parts matches its rest target if it has one, else its first target; -1 when none matches. */
export function targetIndex(targets: GradingTarget[], exerciseId: string, partLabel: string): number {
  const exact = targets.findIndex((t) => t.exercise.id === exerciseId && t.partLabel === partLabel);
  return exact >= 0 ? exact : targets.findIndex((t) => t.exercise.id === exerciseId);
}

/** Where one step goes: another target, or out of the list (then the stepper offers the neighbouring student). */
export type Step = { kind: "target"; index: number } | { kind: "before" } | { kind: "after" };

/** The target one step away, or where the step leaves the list. */
export function stepTarget(targets: GradingTarget[], index: number, dir: 1 | -1): Step {
  // No active target counts as standing just before the first one.
  const next = Math.max(index, -1) + dir;
  if (next < 0) return { kind: "before" };
  if (next >= targets.length) return { kind: "after" };
  return { kind: "target", index: next };
}

/** Input id of the target's score field in the score list. */
export function targetInputId(target: GradingTarget): string {
  return target.partKey === null ? `score-${target.exercise.id}` : `score-${target.exercise.id}-${target.partKey}`;
}

/** Makes the target the stamp target; nothing when there is none (an exam without exercises). */
export function selectTarget(target: GradingTarget | undefined): void {
  if (target) gradingStore.setActivePart(target.exercise.id, target.partLabel);
}

/** The target's short name: "2", "2\u00a0b)" or "2 Rest". */
export function targetTag(target: GradingTarget): string {
  const base = exerciseTag(target.exercise);
  if (target.partKey === null) return base;
  return target.partKey === REST_KEY ? `${base} ${translate("grading.stepper.rest")}` : `${base}\u00a0${target.partKey})`;
}

/** The active target, matched like `targetIndex`. */
export function activeTarget(targets: GradingTarget[], exerciseId: string, partLabel: string): GradingTarget | undefined {
  return targets[targetIndex(targets, exerciseId, partLabel)];
}
