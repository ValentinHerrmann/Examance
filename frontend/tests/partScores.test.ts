import { describe, expect, it } from 'vitest';
import { recalculateAutoScores } from '../src/lib/grading/autoScore';
import type { VectorStroke } from '../src/lib/grading/gradingStore';
import { exerciseParts, hasPartValues, partOverrideKey, partTotal, prunePartScores, REST_KEY, restMax } from '../src/lib/grading/partScores';

const body = String.raw`\begin{Teilaufgabe}{Eins}\BE\BE\end{Teilaufgabe}
\begin{Teilaufgabe}{Zwei}\BE\BE\BE\end{Teilaufgabe}`;
const ex = { id: 'ex-1', maxPoints: 5, latexBody: body };
const stamp = (tool: VectorStroke['tool'], partLabel?: string): VectorStroke => ({
  tool,
  points: [{ x: 0, y: 0 }],
  color: '#ef4444',
  exerciseId: 'ex-1',
  partLabel,
});

describe('part scores (issue #187)', () => {
  it('reads parts and their maxima from the LaTeX', () => {
    expect(exerciseParts(ex)).toEqual([
      { label: 'a', max: 2 },
      { label: 'b', max: 3 },
    ]);
    expect(exerciseParts({ questionType: 'mc', latexBody: body })).toEqual([]);
  });

  it('gives a total only once every part has a value', () => {
    expect(partTotal(ex, { a: 1.5, b: null })).toBeNull();
    expect(partTotal(ex, { a: 1.5, b: 2 })).toBe(3.5);
    expect(hasPartValues({ [REST_KEY]: 1 })).toBe(false);
    expect(hasPartValues({ a: 0 })).toBe(true);
  });

  it('counts points outside the parts and never exceeds the exercise maximum', () => {
    const withIntro = { ...ex, maxPoints: 6, latexBody: String.raw`\BE ` + body };
    expect(restMax(withIntro)).toBe(1);
    expect(partTotal(withIntro, { a: 2, b: 3, [REST_KEY]: 1 })).toBe(6);
    const fixed = { ...ex, maxPoints: 4 };
    expect(restMax(fixed)).toBe(0);
    expect(partTotal(fixed, { a: 2, b: 3 })).toBe(4);
  });

  it('drops parts the exercise no longer has', () => {
    expect(prunePartScores(ex, { a: 1, c: 2, [REST_KEY]: 0.5 })).toEqual({ a: 1, [REST_KEY]: 0.5 });
  });

  it('scores stamps per part, clamped to the part maximum', () => {
    const strokes = [stamp('check_full', 'a'), stamp('check_full', 'a'), stamp('check_full', 'a'), stamp('check_half', 'b')];
    const res = recalculateAutoScores([ex], strokes, {}, {});
    expect(res.partInputs['ex-1']).toEqual({ a: 2, b: 0.5, [REST_KEY]: null });
    expect(res.scoreInputs['ex-1']).toBe(2.5);
  });

  it('leaves the exercise ungraded while a part is missing', () => {
    const res = recalculateAutoScores([ex], [stamp('check_full', 'a')], {}, {});
    expect(res.partInputs['ex-1'].a).toBe(1);
    expect(res.scoreInputs['ex-1']).toBeNull();
  });

  it('empties the parts again when the last part stamp is erased', () => {
    const first = recalculateAutoScores([ex], [stamp('check_full', 'a')], {}, {});
    const res = recalculateAutoScores([ex], [], first.scoreInputs, {}, first.partInputs);
    expect(res.partInputs['ex-1']).toBeUndefined();
    expect(res.scoreInputs['ex-1']).toBeNull();
  });

  it('keeps counting stamps without a part once parts are stamped', () => {
    const strokes = [stamp('check_full'), stamp('check_full'), stamp('check_full', 'a'), stamp('check_full', 'b')];
    const res = recalculateAutoScores([ex], strokes, {}, {});
    expect(res.partInputs['ex-1']).toEqual({ a: 1, b: 1, [REST_KEY]: 2 });
    expect(res.scoreInputs['ex-1']).toBe(4);
  });

  it('keeps a typed part and still counts the stamped one', () => {
    const res = recalculateAutoScores([ex], [stamp('check_full', 'b')], {}, { [partOverrideKey('ex-1', 'a')]: true }, {
      'ex-1': { a: 1.5 },
    });
    expect(res.partInputs['ex-1']).toEqual({ a: 1.5, b: 1, [REST_KEY]: null });
    expect(res.scoreInputs['ex-1']).toBe(2.5);
  });

  it('lets part stamps take over from a typed exercise total', () => {
    const res = recalculateAutoScores([ex], [stamp('check_full', 'a'), stamp('check_full', 'b')], { 'ex-1': 3 }, { 'ex-1': true });
    expect(res.scoreInputs['ex-1']).toBe(2);
  });

  it('scores stamps without a part (older annotations) on the whole exercise', () => {
    const res = recalculateAutoScores([ex], [stamp('check_full'), stamp('check_full')], {}, {});
    expect(res.scoreInputs['ex-1']).toBe(2);
    expect(res.partInputs['ex-1']).toBeUndefined();
  });
});
