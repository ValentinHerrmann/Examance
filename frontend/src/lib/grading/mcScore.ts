/**
 * Pure MC/SC/TF scoring logic.
 *
 * Shared by omrWorker.ts (auto-detected marks) and the grading review UI
 * (manual overrides), so the two can never disagree on a score. Takes only
 * one exercise's own fields — ExamMcGroup is layout-only and must never
 * enter scoring (see the Grading & Statistics Invariant in CLAUDE.md).
 */

import type { OmrScoreMeta } from '$lib/db/schema';

export type McQuestionType = 'mc' | 'sc' | 'tf';

/**
 * True if `ex` is an MC/SC/TF exercise. Prefer this over `questionType !==
 * 'free_text'` — a legacy exercise record predating this field has
 * `questionType === undefined`, which passes that negative check and gets
 * mis-routed into the MC path (empty MC panel, stamp-based auto-scoring
 * silently disabled). Explicit allow-list avoids that trap.
 */
export function isMcQuestion(ex: { questionType?: string }): boolean {
  return ex.questionType === 'mc' || ex.questionType === 'sc' || ex.questionType === 'tf';
}

/**
 * Computes the score for a single MC/SC/TF exercise.
 *
 * - `mc`: right-minus-wrong, floored at 0 —
 *   `clamp(#correctSelected - |penalty| * #wrongSelected, 0, maxPoints)`.
 * - `sc` / `tf`: exact match against `correctAnswers` scores `maxPoints`;
 *   otherwise `0`, or the signed `penalty` if it is negative (preserves the
 *   legacy negative-marking contract for a wrong single choice).
 */
export function computeMcScore(
  questionType: McQuestionType,
  selectedOptions: number[],
  correctAnswers: number[],
  penalty: number,
  maxPoints: number
): number {
  const correctSet = new Set(correctAnswers);
  const selectedSet = new Set(selectedOptions);

  if (questionType === 'mc') {
    let numCorrect = 0;
    let numWrong = 0;
    for (const opt of selectedSet) {
      if (correctSet.has(opt)) numCorrect++;
      else numWrong++;
    }
    const raw = numCorrect - Math.abs(penalty) * numWrong;
    return Math.max(0, Math.min(maxPoints, raw));
  }

  // sc / tf: exact match required.
  const isExactMatch =
    selectedOptions.length === correctAnswers.length &&
    [...selectedSet].every((opt) => correctSet.has(opt));

  if (isExactMatch) return maxPoints;
  if (selectedOptions.length > 0 && penalty < 0) return penalty;
  return 0;
}

export type { OmrScoreMeta };

export interface McCorrectionResult {
  nextSelectedOptions: number[];
  nextScore: number;
  nextOmrMeta: OmrScoreMeta;
}

/**
 * Returns the preserved or newly-initialized original detection snapshot.
 */
function resolveOriginalSnapshot(
  omrMeta?: OmrScoreMeta,
  currentSelectedOptions: number[] = [],
  currentScore?: number
): OmrScoreMeta['original'] | undefined {
  if (omrMeta?.original) {
    return {
      confidence: omrMeta.original.confidence,
      selectedOptions: [...omrMeta.original.selectedOptions],
      score: omrMeta.original.score,
      flaggedOptions: omrMeta.original.flaggedOptions ? [...omrMeta.original.flaggedOptions] : undefined,
    };
  }
  if (omrMeta) {
    return {
      confidence: omrMeta.confidence,
      selectedOptions: [...currentSelectedOptions],
      score: currentScore,
      flaggedOptions: omrMeta.flaggedOptions ? [...omrMeta.flaggedOptions] : undefined,
    };
  }
  return undefined;
}

/**
 * Sets explicit selected options for an MC/SC/TF exercise (e.g. from checkboxes),
 * recomputes score, preserves original detection snapshot, and marks as manually reviewed.
 */
export function setMcSelectedOptions(
  questionType: McQuestionType,
  selectedOptions: number[],
  correctAnswers: number[],
  penalty: number,
  maxPoints: number,
  omrMeta?: OmrScoreMeta,
  currentScore?: number
): McCorrectionResult {
  const normalizedOptions = [...selectedOptions].sort((a, b) => a - b);
  const nextScore = computeMcScore(
    questionType,
    normalizedOptions,
    correctAnswers,
    penalty,
    maxPoints
  );

  const original = resolveOriginalSnapshot(omrMeta, selectedOptions, currentScore);

  const correctedDetections = omrMeta?.detections
    ? {
        ...omrMeta.detections,
        bubbles: omrMeta.detections.bubbles.map((b) => ({
          ...b,
          state: (normalizedOptions.includes(b.optionIndex) ? 'marked' : 'blank') as 'marked' | 'blank',
        })),
      }
    : undefined;

  const nextOmrMeta: OmrScoreMeta = {
    confidence: 'high',
    source: 'manual',
    flaggedOptions: omrMeta?.flaggedOptions,
    original,
    reviewedAt: new Date().toISOString(),
    detections: correctedDetections,
  };

  return {
    nextSelectedOptions: normalizedOptions,
    nextScore,
    nextOmrMeta,
  };
}

/**
 * Toggles an option index for an MC/SC/TF exercise and returns the updated selectedOptions,
 * score, and omrMeta (marking source as manual, recording reviewedAt, and preserving original detection).
 */
export function applyMcCorrection(
  questionType: McQuestionType,
  selectedOptions: number[],
  toggledOptionIdx: number,
  correctAnswers: number[],
  penalty: number,
  maxPoints: number,
  omrMeta?: OmrScoreMeta
): McCorrectionResult {
  const isSingleAnswer = questionType === 'sc' || questionType === 'tf';

  const nextSelectedOptions = isSingleAnswer
    ? selectedOptions.includes(toggledOptionIdx)
      ? []
      : [toggledOptionIdx]
    : selectedOptions.includes(toggledOptionIdx)
      ? selectedOptions.filter((o) => o !== toggledOptionIdx)
      : [...selectedOptions, toggledOptionIdx].sort((a, b) => a - b);

  const currentScore = computeMcScore(questionType, selectedOptions, correctAnswers, penalty, maxPoints);
  const original = resolveOriginalSnapshot(omrMeta, selectedOptions, currentScore);

  const correctedDetections = omrMeta?.detections
    ? {
        ...omrMeta.detections,
        bubbles: omrMeta.detections.bubbles.map((b) => ({
          ...b,
          state: (nextSelectedOptions.includes(b.optionIndex) ? 'marked' : 'blank') as 'marked' | 'blank',
        })),
      }
    : undefined;

  const nextOmrMeta: OmrScoreMeta = {
    confidence: 'high',
    source: 'manual',
    flaggedOptions: omrMeta?.flaggedOptions,
    original,
    reviewedAt: new Date().toISOString(),
    detections: correctedDetections,
  };

  const nextScore = computeMcScore(
    questionType,
    nextSelectedOptions,
    correctAnswers,
    penalty,
    maxPoints
  );

  return {
    nextSelectedOptions,
    nextScore,
    nextOmrMeta,
  };
}

/**
 * Restores the originally detected options, confidence, and score.
 */
export function restoreOriginalDetection(
  questionType: McQuestionType,
  correctAnswers: number[],
  penalty: number,
  maxPoints: number,
  omrMeta?: OmrScoreMeta
): McCorrectionResult | null {
  if (!omrMeta?.original) {
    return null;
  }

  const restoredOptions = [...omrMeta.original.selectedOptions].sort((a, b) => a - b);
  const restoredScore =
    omrMeta.original.score !== undefined
      ? omrMeta.original.score
      : computeMcScore(questionType, restoredOptions, correctAnswers, penalty, maxPoints);

  const restoredDetections = omrMeta.detections
    ? {
        ...omrMeta.detections,
        bubbles: omrMeta.detections.bubbles.map((b) => ({
          ...b,
          state: (restoredOptions.includes(b.optionIndex) ? 'marked' : 'blank') as 'marked' | 'blank',
        })),
      }
    : undefined;

  const nextOmrMeta: OmrScoreMeta = {
    confidence: omrMeta.original.confidence,
    source: 'omr',
    flaggedOptions: omrMeta.original.flaggedOptions ? [...omrMeta.original.flaggedOptions] : undefined,
    original: {
      confidence: omrMeta.original.confidence,
      selectedOptions: [...omrMeta.original.selectedOptions],
      score: omrMeta.original.score,
      flaggedOptions: omrMeta.original.flaggedOptions ? [...omrMeta.original.flaggedOptions] : undefined,
    },
    detections: restoredDetections,
  };

  return {
    nextSelectedOptions: restoredOptions,
    nextScore: restoredScore,
    nextOmrMeta,
  };
}

/**
 * Confirms the current detection as verified by the user without changing option selections.
 */
export function confirmDetection(
  selectedOptions: number[],
  score: number,
  omrMeta?: OmrScoreMeta
): McCorrectionResult {
  const original = resolveOriginalSnapshot(omrMeta, selectedOptions, score);

  const nextOmrMeta: OmrScoreMeta = {
    confidence: omrMeta?.confidence ?? 'high',
    source: 'manual',
    flaggedOptions: omrMeta?.flaggedOptions,
    original,
    reviewedAt: new Date().toISOString(),
    detections: omrMeta?.detections,
  };

  return {
    nextSelectedOptions: [...selectedOptions],
    nextScore: score,
    nextOmrMeta,
  };
}
