/** Pure auto-scoring shared by the canvas viewer and the route/workspace: per exercise (and per part, issue #187) not manually overridden, sums the check/minus stamp points on the current strokes, clamped to [0, max]. */

import type { ExerciseRecord } from '#lib/db/schema';
import type { VectorStroke } from './gradingStore';
import { isMcQuestion } from './mcScore';
import { exerciseParts, partOverrideKey, sumParts, type PartScores } from './partScores';

const STAMP_POINTS: Partial<Record<VectorStroke['tool'], number>> = {
  check_full: 1,
  check: 1,
  check_half: 0.5,
  check_quarter: 0.25,
  minus_full: -1,
  minus_half: -0.5,
  minus_quarter: -0.25,
};

/** Net stamp points of `strokes`, clamped to [0, max]; null without stamps. */
function stampScore(strokes: VectorStroke[], max: number): number | null {
  let total = 0;
  let count = 0;
  for (const stroke of strokes) {
    const points = STAMP_POINTS[stroke.tool];
    if (points === undefined) continue;
    total += points;
    count++;
  }
  return count > 0 ? Math.max(0, Math.min(max, Math.round(total * 100) / 100)) : null;
}

export interface AutoScores {
  scoreInputs: Record<string, number | null>;
  partInputs: Record<string, PartScores>;
}

export function recalculateAutoScores(
  exercises: ExerciseRecord[],
  strokes: VectorStroke[],
  scoreInputs: Record<string, number | null>,
  manualOverride: Record<string, boolean>,
  partInputs: Record<string, PartScores> = {}
): AutoScores {
  const next: Record<string, number | null> = { ...scoreInputs };
  const nextParts: Record<string, PartScores> = { ...partInputs };

  for (const ex of exercises) {
    // MC/SC/TF exercises are scored by mcScore.ts (OMR-derived or manually toggled in McAnswerReview), never by summing check/minus stamps — a stray stamp landing near an MC region must not silently overwrite its score.
    if (isMcQuestion(ex)) continue;
    const own = strokes.filter((stroke) => (stroke.exerciseId || exercises[0]?.id) === ex.id);
    const parts = exerciseParts(ex);
    // Stamps without a part (and annotations from before part scores) keep scoring the whole exercise.
    const partStamped = parts.length > 0 && own.some((s) => s.partLabel && STAMP_POINTS[s.tool] !== undefined);
    if (!partStamped) {
      if (manualOverride[ex.id] || sumParts(nextParts[ex.id]) !== null) continue;
      next[ex.id] = stampScore(own, ex.maxPoints);
      continue;
    }
    if (manualOverride[ex.id] && sumParts(nextParts[ex.id]) === null) continue;
    const values: PartScores = { ...nextParts[ex.id] };
    for (const part of parts) {
      if (manualOverride[partOverrideKey(ex.id, part.label)]) continue;
      values[part.label] = stampScore(own.filter((s) => s.partLabel === part.label), part.max);
    }
    nextParts[ex.id] = values;
    next[ex.id] = sumParts(values);
  }

  return { scoreInputs: next, partInputs: nextParts };
}
