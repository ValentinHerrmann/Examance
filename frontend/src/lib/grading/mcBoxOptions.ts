import type { ExerciseRecord, OmrScoreMeta } from '#lib/db/schema';

type Bubble = NonNullable<OmrScoreMeta['detections']>['bubbles'][number];

/** One answer box of the sheet. `index` is the value `selectedOptions` holds. */
export interface McBoxOption {
  index: number;
  /** Option text; `null` when the boxes do not match the exercise's options (see `mismatch`). */
  text: string | null;
  isCorrect: boolean;
  /** The detector's reading of this box, if the question was detected. */
  bubble?: Bubble;
}

export interface McBoxOptions {
  /** In printed order. */
  options: McBoxOption[];
  /** The scanned boxes are not exactly the options 0..n-1: option texts and answer key do not apply. */
  mismatch: { boxes: number; options: number } | null;
}

/**
 * Pairs a scanned MC question's boxes with the exercise's options by `optionIndex`. Anything but an
 * exact 0..n-1 match is reported as a mismatch, never attached to another option or dropped.
 */
export function matchBoxesToOptions(
  exercise: Pick<ExerciseRecord, 'options' | 'correctAnswers'>,
  detections: OmrScoreMeta['detections']
): McBoxOptions {
  const texts = exercise.options ?? [];
  const correct = new Set(exercise.correctAnswers ?? []);
  const bubbles = [...(detections?.bubbles ?? [])].sort((a, b) => a.optionIndex - b.optionIndex);

  if (bubbles.length === 0 || (bubbles.length === texts.length && bubbles.every((b, i) => b.optionIndex === i))) {
    return {
      options: texts.map((text, index) => ({ index, text, isCorrect: correct.has(index), bubble: bubbles[index] })),
      mismatch: null,
    };
  }

  const byIndex = new Map(bubbles.map((b) => [b.optionIndex, b]));
  return {
    options: [...byIndex.values()].map((bubble) => ({ index: bubble.optionIndex, text: null, isCorrect: false, bubble })),
    mismatch: { boxes: byIndex.size, options: texts.length },
  };
}
