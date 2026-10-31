import type { ExerciseScoreRecord, OmrScoreMeta } from '#lib/db/schema';
import { isMcQuestion } from '#lib/grading/mcScore';

export interface GradingSheet {
  loadedScores: Map<string, ExerciseScoreRecord>;
  scoreInputs: Record<string, number | null>;
  mcState: Record<string, { selectedOptions: number[]; omrMeta?: OmrScoreMeta }>;
}

/** Grade-page state for one submission. Rows of any other submission are dropped: a save writes this sheet under `submissionId`, so a foreign row would move its result (issue #85). */
export function buildGradingSheet(
  submissionId: string,
  rows: ExerciseScoreRecord[],
  exercises: { id: string; questionType?: string }[],
  exerciseIdsWithStrokes: Set<string>,
  manualOverride: Record<string, boolean>
): GradingSheet {
  const own = rows.filter((row) => row.submissionId === submissionId);
  if (own.length !== rows.length) {
    console.warn(`[grading] ignored ${rows.length - own.length} score row(s) of another submission`);
  }
  const loadedScores = new Map(own.map((row) => [row.exerciseId, row]));
  const scoreInputs: GradingSheet['scoreInputs'] = {};
  const mcState: GradingSheet['mcState'] = {};
  for (const ex of exercises) {
    const existing = loadedScores.get(ex.id);
    if (existing && typeof existing.score === 'number' && !isNaN(existing.score)) {
      // Legacy: score 0 without annotations means ungraded. Never for an OMR-read MC row: nulling it made the next save delete the row (and its omrMeta), dropping it from verification.
      const isOmrMc = isMcQuestion(ex) && !!existing.omrMeta;
      if (existing.score === 0 && !isOmrMc && !exerciseIdsWithStrokes.has(ex.id) && !manualOverride[ex.id]) {
        scoreInputs[ex.id] = null;
      } else {
        scoreInputs[ex.id] = existing.score;
      }
    } else {
      scoreInputs[ex.id] = null;
    }
    if (isMcQuestion(ex) && existing) {
      mcState[ex.id] = { selectedOptions: existing.selectedOptions ?? [], omrMeta: existing.omrMeta };
    }
  }
  return { loadedScores, scoreInputs, mcState };
}
