import { describe, expect, it } from 'vitest';
import { allAnswered, answeredCount, itemAnswered, threadAnswerItems } from '../src/lib/sharing/reviewStatus';

describe('reviewStatus (issue #280)', () => {
  it('answers an item by a reply text or a points change', () => {
    expect(itemAnswered({ reply: 'ok', pointsBefore: 3, pointsAfter: 3 })).toBe(true);
    expect(itemAnswered({ reply: '  ', pointsBefore: 3, pointsAfter: 4 })).toBe(true);
    expect(itemAnswered({ reply: '', pointsBefore: 3, pointsAfter: 3 })).toBe(false);
    expect(itemAnswered({ reply: '', pointsBefore: null, pointsAfter: 4 })).toBe(false);
  });

  it('keeps a thread open while one objected exercise has no answer', () => {
    const items = threadAnswerItems({ a: 'too strict', b: 'missed a step' }, { a: 'agreed' }, { a: { before: 2, after: 3 }, b: { before: 1, after: 1 } });
    expect(answeredCount(items)).toEqual({ answered: 1, total: 2 });
    expect(allAnswered(items)).toBe(false);
    expect(allAnswered(threadAnswerItems({ a: 'x', b: 'y' }, { a: 'agreed', b: 'no' }))).toBe(true);
  });

  it('ignores items without an objection text', () => {
    expect(answeredCount([{ objection: ' ', reply: '', pointsBefore: null, pointsAfter: null }])).toEqual({ answered: 0, total: 0 });
  });
});
