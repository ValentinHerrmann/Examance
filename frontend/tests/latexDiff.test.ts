import { describe, expect, it } from 'vitest';
import { computeSideBySideDiff } from '../src/lib/latex/diff';

const types = (left: string, right: string) => {
  const { leftLines, rightLines } = computeSideBySideDiff(left, right);
  return { left: leftLines.map((l) => l.type), right: rightLines.map((l) => l.type) };
};

// The backtrace follows directions recorded in the forward pass instead of re-comparing float sums (issue #244); these pin its output.
describe('computeSideBySideDiff alignment', () => {
  it('matches identical texts line by line', () => {
    expect(types('a\nb\nc', 'a\nb\nc')).toEqual({ left: ['unchanged', 'unchanged', 'unchanged'], right: ['unchanged', 'unchanged', 'unchanged'] });
  });

  it('aligns an inserted line against an empty slot', () => {
    const { leftLines, rightLines } = computeSideBySideDiff('a\nc', 'a\nb\nc');
    expect(rightLines.map((l) => l.text)).toEqual(['a', 'b', 'c']);
    expect(leftLines.map((l) => l.type)[1]).toBe('empty');
    expect(rightLines[1].type).toBe('added');
  });

  it('aligns a deleted line against an empty slot', () => {
    const { leftLines, rightLines } = computeSideBySideDiff('a\nb\nc', 'a\nc');
    expect(leftLines.map((l) => l.text)).toEqual(['a', 'b', 'c']);
    expect(leftLines[1].type).toBe('removed');
    expect(rightLines[1].type).toBe('empty');
  });

  it('pairs a slightly edited line as one modification', () => {
    const { leftLines, rightLines } = computeSideBySideDiff('\\item foo bar baz', '\\item foo bar qux');
    expect(leftLines.map((l) => l.type)).toEqual(['modified']);
    expect(rightLines.map((l) => l.type)).toEqual(['modified']);
    expect(rightLines[0].text).toBe('\\item foo bar qux');
  });

  it('replaces an unrelated line by a deletion and an insertion', () => {
    const { leftLines, rightLines } = computeSideBySideDiff('x', 'completely different line');
    expect(leftLines.map((l) => l.type)).toEqual(['empty', 'removed']);
    expect(rightLines.map((l) => l.type)).toEqual(['added', 'empty']);
  });
});
