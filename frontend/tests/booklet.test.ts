import { describe, expect, it } from 'vitest';
import { bookletSides } from '../src/lib/qr/booklet';

describe('bookletSides (issue #220)', () => {
  it('imposes 4 pages on one sheet', () => {
    expect(bookletSides(4)).toEqual([{ left: 4, right: 1 }, { left: 2, right: 3 }]);
  });

  it('imposes 8 pages on two nested sheets', () => {
    expect(bookletSides(8)).toEqual([
      { left: 8, right: 1 }, { left: 2, right: 7 },
      { left: 6, right: 3 }, { left: 4, right: 5 },
    ]);
  });

  it('places every page of 12 exactly once', () => {
    const pages = bookletSides(12).flatMap((s) => [s.left, s.right]).sort((a, b) => a - b);
    expect(pages).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  it('fills a short booklet with blank halves (0)', () => {
    expect(bookletSides(6).flatMap((s) => [s.left, s.right]).filter((p) => p === 0)).toHaveLength(2);
  });
});
