/**
 * Pure auto-scoring shared by the canvas viewer and the route/workspace: per exercise not manually
 * overridden, sums the check/minus stamp points on the current strokes, clamped to [0, maxPoints].
 */

import type { ExerciseRecord } from '#lib/db/schema';
import type { VectorStroke } from './gradingStore';
import { isMcQuestion } from './mcScore';

export function recalculateAutoScores(
  exercises: ExerciseRecord[],
  strokes: VectorStroke[],
  scoreInputs: Record<string, number | null>,
  manualOverride: Record<string, boolean>
): Record<string, number | null> {
  const next: Record<string, number | null> = { ...scoreInputs };

  for (const ex of exercises) {
    // MC/SC/TF exercises are scored by mcScore.ts (OMR-derived or manually toggled in
    // McAnswerReview), never by summing check/minus stamps — a stray stamp landing near
    // an MC region must not silently overwrite its score.
    if (isMcQuestion(ex)) continue;
    if (manualOverride[ex.id]) continue;
    let positivePoints = 0;
    let negativePoints = 0;
    let stampCount = 0;

    for (const stroke of strokes) {
      const targetId = stroke.exerciseId || (exercises[0] ? exercises[0].id : undefined);
      if (targetId === ex.id) {
        if (stroke.tool === 'check_full' || stroke.tool === 'check') {
          positivePoints += 1.0;
          stampCount++;
        } else if (stroke.tool === 'check_half') {
          positivePoints += 0.5;
          stampCount++;
        } else if (stroke.tool === 'check_quarter') {
          positivePoints += 0.25;
          stampCount++;
        } else if (stroke.tool === 'minus_full') {
          negativePoints += 1.0;
          stampCount++;
        } else if (stroke.tool === 'minus_half') {
          negativePoints += 0.5;
          stampCount++;
        } else if (stroke.tool === 'minus_quarter') {
          negativePoints += 0.25;
          stampCount++;
        }
      }
    }

    if (stampCount > 0) {
      const calculated = positivePoints - negativePoints;
      next[ex.id] = Math.max(0, Math.min(ex.maxPoints, Math.round(calculated * 100) / 100));
    } else {
      next[ex.id] = null;
    }
  }

  return next;
}
