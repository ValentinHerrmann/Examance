import { describe, expect, it } from 'vitest';
import type { GradingReviewItem } from '../src/lib/db/schema';
import { findScoreBox, type ScoreBoxContext } from '../src/lib/grading/scoreBoxes';
import { layoutBlocks, pointsText, printableItems, reviewAttachmentText, shortText, type ReviewLabels } from '../src/lib/export/reviewPrint';

const labels: ReviewLabels = { review: 'Einsicht', points: 'P.', objection: 'Einwand', reply: 'Antwort', truncated: '(Anhang)', title: 'Einsicht' };
const font = { widthOfTextAtSize: (t: string, size: number) => t.length * size * 0.5 };
const item = (over: Partial<GradingReviewItem> = {}): GradingReviewItem => ({ key: 'e1', label: '3', objection: 'Why?', reply: 'Because.', pointsBefore: 3, pointsAfter: 4, ...over });

describe('reviewPrint (issue #226)', () => {
  it('keeps only items with an objection', () => {
    expect(printableItems([item(), item({ objection: '  ' })])).toHaveLength(1);
  });

  it('writes the short note with an ASCII arrow', () => {
    expect(shortText(item(), labels)).toBe('Einsicht: 3 -> 4 P.');
    expect(pointsText(item({ pointsBefore: null }), labels)).toBe('4 P.');
    expect(shortText(item({ pointsBefore: null, pointsAfter: null }), labels)).toBe('Einsicht');
  });

  it('attaches the full thread', () => {
    const text = reviewAttachmentText([item()], labels);
    expect(text).toContain('Einwand: Why?');
    expect(text).toContain('Antwort: Because.');
  });

  it('stacks blocks without overlap and truncates when nothing else fits', () => {
    const long = item({ objection: 'word '.repeat(400) });
    const layout = layoutBlocks(font, [long, item({ key: 'e2' })], labels, { width: 100, pageTop: 800, bottom: 560, sizes: [8, 6], tops: [700, 690] });
    expect(layout.fits).toBe(true);
    const [a, b] = layout.blocks;
    expect(b.top).toBeLessThan(a.top - a.lines.length * layout.size * 1.2 + 0.001);
    expect(a.lines.join(' ')).toContain('(Anhang)');
  });

  it('finds part boxes and falls back to the exercise box', () => {
    const ctx = {
      positions: { 2: ['e1'] },
      pages: [{ pageIndex: 0, pageWidthPt: 1, pageHeightPt: 1, fiducials: [], bubbles: [], scoreBoxes: [{ box: 'task', position: 2, rect: [0, 0, 1, 1] }, { box: 'part', position: 2, part: 'a', rect: [1, 1, 2, 2] }] }],
    } as unknown as ScoreBoxContext;
    expect(findScoreBox(ctx, 'e1#a')?.box.rect).toEqual([1, 1, 2, 2]);
    expect(findScoreBox(ctx, 'e1#b')?.box.rect).toEqual([0, 0, 1, 1]);
    expect(findScoreBox(ctx, 'zzz')).toBeNull();
  });
});
