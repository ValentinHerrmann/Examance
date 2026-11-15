import { describe, expect, it } from 'vitest';
import type { GradingReviewItem } from '../src/lib/db/schema';
import { findScoreBox, type ScoreBoxContext } from '../src/lib/grading/scoreBoxes';
import {
  anyReviewPrint,
  BOTTOM_STRIP_HEIGHT_PT,
  bottomColumns,
  captionHeight,
  DEFAULT_REVIEW_PRINT,
  layoutBlocks,
  NO_REVIEW_PRINT,
  pointsText,
  printableItems,
  reviewAttachmentText,
  shareReviewOptions,
  shortText,
  stripFrame,
  STRIP_WIDTH_PT,
  stripGeometry,
  toggleReviewOption,
  type ReviewLabels,
} from '../src/lib/export/reviewPrint';
import { drawScissorLine, SCISSORS_GAP } from '../src/lib/pdf/labelKit';
import { parseReviewPrint } from '../src/lib/export/reviewPrintPrefs';

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

  it('prints the short note only by default', () => {
    expect(DEFAULT_REVIEW_PRINT).toEqual({ short: true, strip: 'none', summary: false, attach: false });
    expect(anyReviewPrint(DEFAULT_REVIEW_PRINT)).toBe(true);
    expect(anyReviewPrint(NO_REVIEW_PRINT)).toBe(false);
  });

  it.each([
    ['short', { ...NO_REVIEW_PRINT, short: true }],
    ['side', { ...NO_REVIEW_PRINT, strip: 'side' }],
    ['bottom', { ...NO_REVIEW_PRINT, strip: 'bottom' }],
    ['summary', { ...NO_REVIEW_PRINT, summary: true }],
    ['attach', { ...NO_REVIEW_PRINT, attach: true }],
  ] as const)('ticking %s switches on only that part', (key, expected) => {
    expect(toggleReviewOption(NO_REVIEW_PRINT, key, true)).toEqual(expected);
    expect(anyReviewPrint(expected)).toBe(true);
  });

  it('keeps side and bottom strip exclusive and the other parts independent', () => {
    const side = toggleReviewOption(DEFAULT_REVIEW_PRINT, 'side', true);
    expect(side.strip).toBe('side');
    const bottom = toggleReviewOption(side, 'bottom', true);
    expect(bottom).toEqual({ ...DEFAULT_REVIEW_PRINT, strip: 'bottom' });
    expect(toggleReviewOption(bottom, 'side', false)).toBe(bottom);
    expect(toggleReviewOption(bottom, 'bottom', false).strip).toBe('none');
    expect(toggleReviewOption(bottom, 'summary', true)).toEqual({ ...bottom, summary: true });
    expect(toggleReviewOption(bottom, 'short', false).strip).toBe('bottom');
  });

  it('never attaches to the copy shared with students', () => {
    expect(shareReviewOptions({ ...DEFAULT_REVIEW_PRINT, attach: true, summary: true })).toEqual({ ...DEFAULT_REVIEW_PRINT, summary: true, attach: false });
  });

  it('grows the page only for a strip with items', () => {
    expect(stripGeometry('side', false, 1, 100, 200)).toMatchObject({ width: 100, height: 200, sideX: null, bottom: false });
    expect(stripGeometry('none', true, 1, 100, 200)).toMatchObject({ width: 100, sideX: null, bottom: false });
    expect(stripGeometry('side', true, 1, 100, 200)).toMatchObject({ width: 100 + STRIP_WIDTH_PT, imageX: 0, sideX: 100 });
    expect(stripGeometry('side', true, 2, 100, 200)).toMatchObject({ width: 100 + STRIP_WIDTH_PT, imageX: STRIP_WIDTH_PT, sideX: 0 });
    expect(stripGeometry('bottom', true, 2, 100, 200)).toMatchObject({ height: 200 + BOTTOM_STRIP_HEIGHT_PT, imageY: BOTTOM_STRIP_HEIGHT_PT, bottom: true, sideX: null });
  });

  it('lays the bottom strip out left to right without overlap', () => {
    const cols = bottomColumns([50, 60, 400], 595);
    expect(cols.length).toBeGreaterThan(1);
    for (const [i, col] of cols.entries()) {
      expect(col.x).toBeGreaterThanOrEqual(0);
      expect(col.x + col.w).toBeLessThanOrEqual(595);
      if (i > 0) expect(col.x).toBeGreaterThanOrEqual(cols[i - 1].x + cols[i - 1].w);
    }
    expect(cols.at(-1)?.to).toBe(3);
    expect(bottomColumns([], 595)).toEqual([]);
    const many = bottomColumns(Array.from({ length: 30 }, (_, i) => i * 10), 595);
    expect(many.at(-1)?.to).toBe(30);
    expect(many.every((c) => c.w >= 90 && c.x + c.w <= 595)).toBe(true);
  });

  it('remembers a choice and falls back to the default for anything unreadable', () => {
    const chosen = { short: false, strip: 'bottom', summary: true, attach: true } as const;
    expect(parseReviewPrint(JSON.stringify(chosen))).toEqual(chosen);
    expect(parseReviewPrint(null)).toEqual(DEFAULT_REVIEW_PRINT);
    expect(parseReviewPrint('{oops')).toEqual(DEFAULT_REVIEW_PRINT);
    expect(parseReviewPrint('{"strip":"diagonal","short":"yes"}')).toEqual(DEFAULT_REVIEW_PRINT);
  });

  it('frames the strip and marks the paper edge without touching the scan', () => {
    const right = stripFrame(stripGeometry('side', true, 1, 100, 200))!;
    expect(right.rect).toEqual({ x: 100, y: 0, width: STRIP_WIDTH_PT, height: 200 });
    expect(right.edge.from.x).toBeGreaterThanOrEqual(100);
    expect(right.edge.from.x).toBeCloseTo(100, 0);
    expect(right.edge.to).toEqual({ x: right.edge.from.x, y: 200 });
    const left = stripFrame(stripGeometry('side', true, 2, 100, 200))!;
    expect(left.rect).toEqual({ x: 0, y: 0, width: STRIP_WIDTH_PT, height: 200 });
    expect(left.edge.from.x).toBeLessThanOrEqual(STRIP_WIDTH_PT);
    expect(left.edge.from.x).toBeCloseTo(STRIP_WIDTH_PT, 0);
    const bottom = stripFrame(stripGeometry('bottom', true, 1, 100, 200))!;
    expect(bottom.rect).toEqual({ x: 0, y: 0, width: 100, height: BOTTOM_STRIP_HEIGHT_PT });
    expect(bottom.edge.from.y).toBeLessThanOrEqual(BOTTOM_STRIP_HEIGHT_PT);
    expect(bottom.edge.from.y).toBeCloseTo(BOTTOM_STRIP_HEIGHT_PT, 0);
    expect(bottom.edge.to).toEqual({ x: 100, y: bottom.edge.from.y });
    expect(stripFrame(stripGeometry('none', true, 1, 100, 200))).toBeNull();
  });

  it('reserves room for the caption above the first block', () => {
    expect(captionHeight(1)).toBeGreaterThan(0);
    expect(captionHeight(3)).toBeGreaterThan(captionHeight(2));
  });

  it('draws the dashed cut line with two scissors, each as the same two paths', () => {
    const paths: string[] = [];
    const lines: unknown[] = [];
    const page = { drawSvgPath: (d: string) => paths.push(d), drawLine: (o: unknown) => lines.push(o) };
    const lib = { rgb: (...c: number[]) => c, degrees: (d: number) => d };
    drawScissorLine(lib as never, page as never, { from: { x: 0, y: 0 }, to: { x: 0, y: 300 } }, { gray: 0.5, thickness: 0.6 });
    expect(paths).toHaveLength(4);
    expect(paths[0]).toBe(paths[2]);
    expect(paths[1]).toBe(paths[3]);
    expect(lines).toHaveLength(3);
    expect(SCISSORS_GAP).toBeCloseTo(8.5, 0);
  });
});
