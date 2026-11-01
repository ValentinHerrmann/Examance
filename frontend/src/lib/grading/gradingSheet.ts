import type { ExerciseScoreRecord, OmrScoreMeta } from '#lib/db/schema';
import { inferManualOverrides } from '#lib/grading/autoScore';
import type { VectorStroke } from '#lib/grading/gradingStore';
import { isMcQuestion } from '#lib/grading/mcScore';
import { hasPartValues, partTotal, prunePartScores, type PartExercise, type PartScores } from '#lib/grading/partScores';

export interface GradingSheet {
  loadedScores: Map<string, ExerciseScoreRecord>;
  scoreInputs: Record<string, number | null>;
  mcState: Record<string, { selectedOptions: number[]; omrMeta?: OmrScoreMeta }>;
  partInputs: Record<string, PartScores>;
  /** Scores that were typed rather than stamped (`inferManualOverrides`). */
  manualOverride: Record<string, boolean>;
}

/** Grade-page state for one submission, given its stored rows and annotation strokes. Rows of any other submission are dropped: a save writes this sheet under `submissionId`, so a foreign row would move its result (issue #85). */
export function buildGradingSheet(
  submissionId: string,
  rows: ExerciseScoreRecord[],
  exercises: PartExercise[],
  strokes: VectorStroke[]
): GradingSheet {
  const own = rows.filter((row) => row.submissionId === submissionId);
  if (own.length !== rows.length) {
    console.warn(`[grading] ignored ${rows.length - own.length} score row(s) of another submission`);
  }
  const exerciseIdsWithStrokes = new Set(strokes.flatMap((s) => (s.exerciseId ? [s.exerciseId] : [])));
  const loadedScores = new Map(own.map((row) => [row.exerciseId, row]));
  const scoreInputs: GradingSheet['scoreInputs'] = {};
  const mcState: GradingSheet['mcState'] = {};
  const partInputs: GradingSheet['partInputs'] = {};
  for (const ex of exercises) {
    const existing = loadedScores.get(ex.id);
    const parts = isMcQuestion(ex) ? {} : prunePartScores(ex, existing?.partScores);
    if (hasPartValues(parts)) {
      // Graded part by part: the score follows from the parts (null while one is missing).
      partInputs[ex.id] = parts;
      scoreInputs[ex.id] = partTotal(ex, parts);
    } else if (existing && typeof existing.score === 'number' && !isNaN(existing.score)) {
      // Legacy: score 0 without annotations means ungraded. Never for an OMR-read MC row: nulling it made the next save delete the row (and its omrMeta), dropping it from verification.
      const isOmrMc = isMcQuestion(ex) && !!existing.omrMeta;
      scoreInputs[ex.id] = existing.score === 0 && !isOmrMc && !exerciseIdsWithStrokes.has(ex.id) ? null : existing.score;
    } else {
      scoreInputs[ex.id] = null;
    }
    if (isMcQuestion(ex) && existing) {
      mcState[ex.id] = { selectedOptions: existing.selectedOptions ?? [], omrMeta: existing.omrMeta };
    }
  }
  const manualOverride = inferManualOverrides(exercises, strokes, scoreInputs, partInputs);
  return { loadedScores, scoreInputs, mcState, partInputs, manualOverride };
}
