/** Pure auto-scoring shared by the canvas viewer and the grade route: sums the check/minus stamps per exercise, or per part once an exercise is graded part by part (issue #187), skipping scores the teacher typed. */

import type { VectorStroke } from './gradingStore';
import { isMcQuestion } from './mcScore';
import { exerciseParts, hasPartValues, partOverrideKey, partTotal, prunePartScores, REST_KEY, type PartExercise, type PartScores } from './partScores';

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
export function stampScore(strokes: VectorStroke[], max: number): number | null {
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

type ScoredExercise = PartExercise;

/** The exercise's stamps; strokes without an exercise belong to the first one (annotations from before stamp targets). */
function ownStrokes(exercises: ScoredExercise[], strokes: VectorStroke[], id: string): VectorStroke[] {
  return strokes.filter((s) => (s.exerciseId || exercises[0]?.id) === id);
}

/** What the stamps alone give each part bucket: letters clamped to the part maximum, stamps without a part to the rest. */
function stampedParts(ex: ScoredExercise, own: VectorStroke[]): PartScores {
  const values: PartScores = {};
  for (const part of exerciseParts(ex)) values[part.label] = stampScore(own.filter((s) => s.partLabel === part.label), part.max);
  values[REST_KEY] = stampScore(own.filter((s) => !s.partLabel), ex.maxPoints);
  return values;
}

export interface AutoScores {
  scoreInputs: Record<string, number | null>;
  partInputs: Record<string, PartScores>;
}

export function recalculateAutoScores(
  exercises: ScoredExercise[],
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
    const own = ownStrokes(exercises, strokes, ex.id);
    const wasByParts = hasPartValues(partInputs[ex.id]);
    const stamped = stampedParts(ex, own);
    const current = prunePartScores(ex, partInputs[ex.id]);
    // Typed parts stay; every other bucket follows its stamps, so erasing the last stamp empties it again.
    const values: PartScores = {};
    for (const key of Object.keys(stamped)) {
      values[key] = manualOverride[partOverrideKey(ex.id, key)] ? (current[key] ?? null) : stamped[key];
    }
    if (hasPartValues(values)) {
      // Graded part by part: a typed exercise total gives way, stamps without a part count as the rest.
      nextParts[ex.id] = values;
      next[ex.id] = partTotal(ex, values);
      continue;
    }
    delete nextParts[ex.id];
    // A typed total survives, unless it was the sum of parts that are gone now.
    if (manualOverride[ex.id] && !wasByParts) continue;
    next[ex.id] = stampScore(own, ex.maxPoints);
  }

  return { scoreInputs: next, partInputs: nextParts };
}

/** Which loaded scores were typed rather than stamped (a value the stamps do not give), so a recalculation after reopening keeps them. The flags themselves are not stored. */
export function inferManualOverrides(
  exercises: ScoredExercise[],
  strokes: VectorStroke[],
  scoreInputs: Record<string, number | null>,
  partInputs: Record<string, PartScores>
): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const ex of exercises) {
    if (isMcQuestion(ex)) continue;
    const own = ownStrokes(exercises, strokes, ex.id);
    const parts = partInputs[ex.id];
    if (hasPartValues(parts)) {
      const stamped = stampedParts(ex, own);
      for (const [key, value] of Object.entries(parts)) {
        if (value !== null && value !== stamped[key]) flags[partOverrideKey(ex.id, key)] = true;
      }
    } else if (scoreInputs[ex.id] != null && scoreInputs[ex.id] !== stampScore(own, ex.maxPoints)) {
      flags[ex.id] = true;
    }
  }
  return flags;
}
