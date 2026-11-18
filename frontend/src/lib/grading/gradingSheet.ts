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

/** The stored score of an exercise not graded part by part; a stored 0 is a grade like any other (issue #298: loading it as ungraded made the next save delete it). */
function storedScore(row: ExerciseScoreRecord | undefined): number | null {
  return typeof row?.score === 'number' && !Number.isNaN(row.score) ? row.score : null;
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
    } else {
      scoreInputs[ex.id] = storedScore(existing);
    }
    if (isMcQuestion(ex) && existing) {
      mcState[ex.id] = { selectedOptions: existing.selectedOptions ?? [], omrMeta: existing.omrMeta };
    }
  }
  const manualOverride = inferManualOverrides(exercises, strokes, scoreInputs, partInputs);
  return { loadedScores, scoreInputs, mcState, partInputs, manualOverride };
}
