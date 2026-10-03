import type { ExerciseScoreRecord } from '$lib/db/schema';
import type { OmrExerciseResult } from '$lib/workers/omrWorker';
import type { OmrPageStats, OmrRunInfo } from './omrSettings';
import type { OmrShapeFeatures } from './omrShape';

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Rounds every numeric feature — keeps each sealed score row small. */
function roundShape(shape: OmrShapeFeatures): OmrShapeFeatures {
  return Object.fromEntries(
    Object.entries(shape).map(([k, v]) => [k, typeof v === 'number' ? round3(v) : v])
  ) as unknown as OmrShapeFeatures;
}

/**
 * Re-detection of an already-verified question: the teacher's decision (selection, score,
 * `source`/`reviewedAt`, donation marker) stays; only the recorded detection is replaced. A re-run that
 * could not read the question leaves the row untouched, else its `failed` confidence and empty
 * `original` would move a verified item into the "failed" queue.
 */
export function mergeRedetectionIntoVerified(
  existing: ExerciseScoreRecord,
  fresh: ExerciseScoreRecord
): ExerciseScoreRecord {
  const meta = existing.omrMeta;
  const next = fresh.omrMeta;
  if (!meta || !next || next.confidence === 'failed' || !next.detections) return existing;
  const selected = existing.selectedOptions ?? [];
  return {
    ...existing,
    omrMeta: {
      ...meta,
      confidence: next.confidence,
      alignmentUncertain: next.alignmentUncertain,
      flaggedOptions: next.flaggedOptions,
      original: next.original,
      run: next.run,
      pageStats: next.pageStats,
      detections: {
        ...next.detections,
        bubbles: next.detections.bubbles.map((b) => ({
          ...b,
          state: (selected.includes(b.optionIndex) ? 'marked' : 'blank') as 'marked' | 'blank',
        })),
      },
    },
  };
}

/**
 * Turns one worker result into the persisted score row (initial scan and re-run). Keeps raw
 * per-bubble readings, registration stats and the run snapshot, so a reviewed row is a labelled
 * calibration sample. All of it lives in the sealed `omrMeta`: pupil-derived, never a plaintext
 * column, index or log line.
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
                ...(b.shape ? { shape: roundShape(b.shape) } : {}),
                ...(b.reasons?.length ? { reasons: [...b.reasons] } : {}),
                ...(b.provisional !== undefined ? { provisional: b.provisional } : {}),
                ...(b.alt ? { alt: { ...b.alt, ...(b.alt.reasons ? { reasons: [...b.alt.reasons] } : {}) } } : {}),
              })),
            }
          : undefined,
    },
  };
}
