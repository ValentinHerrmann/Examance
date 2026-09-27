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
 * Re-detection of a question a teacher already verified: the teacher's decision (selection, score,
 * `source`/`reviewedAt`, donation marker) stays exactly as it is — only the recorded detection is
 * replaced (scanner reading, flags, `original`, run snapshot, raw features, `alt`), so statistics
 * and the v2/v4 comparison show how the new settings would have read this sheet. Display `state`
 * keeps following the verified selection. Keeps the old detections if the new run could not align.
 */
export function mergeRedetectionIntoVerified(
  existing: ExerciseScoreRecord,
  fresh: ExerciseScoreRecord
): ExerciseScoreRecord {
  const meta = existing.omrMeta;
  const next = fresh.omrMeta;
  if (!meta || !next) return existing;
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
      detections: next.detections
        ? {
            ...next.detections,
            bubbles: next.detections.bubbles.map((b) => ({
              ...b,
              state: (selected.includes(b.optionIndex) ? 'marked' : 'blank') as 'marked' | 'blank',
            })),
          }
        : meta.detections,
    },
  };
}

/**
 * Turns one worker result into the score row that gets persisted — the only place that does,
 * for both the initial scan (scan page) and a re-run (verify page).
 *
 * Besides the detection itself it keeps the raw per-bubble readings (`fillRatio`, `redoRatio`,
 * immutable `detectedState`, shape measurements and `reasons`), the page's registration stats and
 * the run snapshot. Together with the teacher's later verification that makes every reviewed row a
 * labelled calibration sample.
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
