import { describe, it, expect } from 'vitest';
import { matchBoxesToOptions } from '../src/lib/grading/mcBoxOptions';
import type { OmrScoreMeta } from '../src/lib/db/schema';

type Detections = NonNullable<OmrScoreMeta['detections']>;
type Bubble = Detections['bubbles'][number];

function bubble(optionIndex: number, extra: Partial<Bubble> = {}): Bubble {
  return { optionIndex, state: 'blank', rect: [0.1 * optionIndex, 0, 0.1 * optionIndex + 0.05, 0.05], ...extra };
}

function detections(bubbles: Bubble[]): Detections {
  return { pageIndex: 0, bubbles };
}

const exercise = { options: ['richtig', 'falsch', 'auch richtig'], correctAnswers: [0, 2] };

describe('matchBoxesToOptions', () => {
  it('pairs every box with its own option, in printed order', () => {
    const solid = bubble(2, { state: 'ambiguous', detectedState: 'ambiguous', reasons: ['solid'] });
    // Stored out of order on purpose: matching goes by optionIndex, never by array position.
    const result = matchBoxesToOptions(exercise, detections([solid, bubble(0, { state: 'marked' }), bubble(1)]));
    expect(result.mismatch).toBeNull();
    expect(result.options.map((o) => [o.index, o.text, o.isCorrect])).toEqual([
      [0, 'richtig', true],
      [1, 'falsch', false],
      [2, 'auch richtig', true],
    ]);
    expect(result.options[1].bubble?.reasons).toBeUndefined();
    expect(result.options[2].bubble).toBe(solid);
  });

  it('lists all options when the question has no detected boxes (failed detection)', () => {
    const result = matchBoxesToOptions(exercise, undefined);
    expect(result.mismatch).toBeNull();
    expect(result.options.map((o) => o.text)).toEqual(['richtig', 'falsch', 'auch richtig']);
    expect(result.options.every((o) => o.bubble === undefined)).toBe(true);
  });

  it('reports more boxes than options instead of dropping a box', () => {
    const stale = { options: ['richtig', 'falsch'], correctAnswers: [0] };
    const solid = bubble(2, { reasons: ['solid'] });
    const result = matchBoxesToOptions(stale, detections([bubble(0), bubble(1), solid]));
    expect(result.mismatch).toEqual({ boxes: 3, options: 2 });
    expect(result.options.map((o) => o.index)).toEqual([0, 1, 2]);
    expect(result.options.every((o) => o.text === null && !o.isCorrect)).toBe(true);
    expect(result.options[2].bubble).toBe(solid);
  });

  it('reports fewer boxes than options', () => {
    const result = matchBoxesToOptions(exercise, detections([bubble(0), bubble(1)]));
    expect(result.mismatch).toEqual({ boxes: 2, options: 3 });
    expect(result.options).toHaveLength(2);
  });

  it('reports a gap in the box numbering even when the counts agree', () => {
    const result = matchBoxesToOptions(exercise, detections([bubble(0), bubble(1), bubble(3)]));
    expect(result.mismatch).toEqual({ boxes: 3, options: 3 });
    expect(result.options.map((o) => o.index)).toEqual([0, 1, 3]);
  });

  it('reports duplicate box indices', () => {
    const result = matchBoxesToOptions(exercise, detections([bubble(0), bubble(1), bubble(1)]));
    expect(result.mismatch).toEqual({ boxes: 2, options: 3 });
  });
});
