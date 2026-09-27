import type { ExerciseScoreRecord } from '$lib/db/schema';
import type { OmrExerciseResult } from '$lib/workers/omrWorker';
import type { OmrPageStats, OmrRunInfo } from './omrSettings';

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Turns one worker result into the score row that gets persisted — the only place that does,
 * for both the initial scan (scan page) and a re-run (verify page).
 *
 * Besides the detection itself it keeps the raw per-bubble readings (`fillRatio`, `redoRatio`,
 * immutable `detectedState`), the page's registration stats and the run snapshot. Together with
 * the teacher's later verification that makes every reviewed row a labelled calibration sample.
 * All of it lives inside the sealed `omrMeta` — pupil-derived data, never a plaintext column,
 * index or log line.
 */
export function buildOmrScoreRecord(
  r: OmrExerciseResult,
  opts: { id: string; submissionId: string; run: OmrRunInfo; pageStats?: OmrPageStats }
): ExerciseScoreRecord {
  const failed = r.confidence === 'failed';
  const flagged = r.flaggedOptions.length > 0 ? r.flaggedOptions : undefined;
  return {
    id: opts.id,
    submissionId: opts.submissionId,
    exerciseId: r.exerciseId,
    // A failed alignment has no trustworthy score — leave it unset so it hydrates as
    // "ungraded" (grade/+page.svelte) instead of silently contributing a 0.
    score: failed ? undefined : r.score,
    selectedOptions: failed ? [] : r.selectedOptions,
    omrMeta: {
      confidence: r.confidence,
      source: 'omr',
      alignmentUncertain: r.alignmentUncertain ? true : undefined,
      flaggedOptions: flagged,
      original: {
        confidence: r.confidence,
        selectedOptions: failed ? [] : [...r.selectedOptions],
        score: failed ? undefined : r.score,
        flaggedOptions: flagged ? [...flagged] : undefined,
      },
      run: opts.run,
      pageStats: opts.pageStats,
      detections:
        !failed && r.bubbles.length > 0
          ? {
              pageIndex: r.pageIndex,
              bubbles: r.bubbles.map((b) => ({
                optionIndex: b.optionIndex,
                state: b.state,
                rect: b.rect,
                detectedState: b.state,
                fillRatio: round3(b.fillRatio),
                ...(b.redoRatio !== undefined ? { redoRatio: round3(b.redoRatio) } : {}),
              })),
            }
          : undefined,
    },
  };
}
