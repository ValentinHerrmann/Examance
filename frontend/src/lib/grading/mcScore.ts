/**
 * Pure MC/SC/TF scoring logic.
 *
 * Shared by omrWorker.ts (auto-detected marks) and the grading review UI
 * (manual overrides), so the two can never disagree on a score. Takes only
 * one exercise's own fields — ExamMcGroup is layout-only and must never
 * enter scoring (see the Grading & Statistics Invariant in CLAUDE.md).
 */

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
