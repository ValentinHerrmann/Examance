import { describe, expect, it } from 'vitest';
import { clampBookletOffset, clampExtraPages, printFileKey, printSettingsOf, stickerPagesOf, stickersPerCopy, type PrintSettings } from '../src/lib/exam/printLayout';
import { printStamps } from '../src/lib/exam/examChecks';

const settings = (patch: Partial<PrintSettings>): PrintSettings => ({ pageCodes: true, layout: 'duplex', mode: 'stickers', stickerSpots: 'sheet', paperStyle: 'squared', extraPages: 0, bookletOffsetMm: 0, digitalGrading: true, resultsQrBox: false, cutCorner: true, foldStrip: true, dottedFields: false, ...patch });

describe('print settings (issue #220)', () => {
  it('reads older exams as the old layout', () => {
    expect(printSettingsOf({})).toEqual({ pageCodes: false, layout: 'duplex', mode: 'stickers', stickerSpots: 'cover', paperStyle: 'empty', extraPages: 0, bookletOffsetMm: 0, digitalGrading: true, resultsQrBox: false, cutCorner: true, foldStrip: true, dottedFields: false });
  });

  it('falls back to a spot choice the layout offers', () => {
    expect(printSettingsOf({ printLayout: 'booklet', stickerSpots: 'sheet' }).stickerSpots).toBe('leaf');
    expect(printSettingsOf({ printLayout: 'duplex', stickerSpots: 'a3' }).stickerSpots).toBe('sheet');
  });

  it('puts spots on every sheet front from page 3 (duplex, cut booklet leaves)', () => {
    expect(stickerPagesOf(settings({}), 6)).toEqual([3, 5]);
    expect(stickerPagesOf(settings({ layout: 'booklet', stickerSpots: 'leaf' }), 8)).toEqual([3, 5, 7]);
  });

  it('puts A3 spots on each sheet front right page 2s+1 (first half of the booklet)', () => {
    expect(stickerPagesOf(settings({ layout: 'booklet', stickerSpots: 'a3' }), 8)).toEqual([3]);
    expect(stickerPagesOf(settings({ layout: 'booklet', stickerSpots: 'a3' }), 12)).toEqual([3, 5]);
  });

  it('needs no spots for the cover choice or personalised copies', () => {
    expect(stickerPagesOf(settings({ stickerSpots: 'cover' }), 8)).toEqual([]);
    expect(stickerPagesOf(settings({ mode: 'copies' }), 8)).toEqual([]);
    expect(stickersPerCopy(settings({}), 6)).toBe(3);
  });

  it('outdates a made file when the arranging or the sticker count changes', () => {
    expect(printFileKey('copies', 'impose', 1)).not.toBe(printFileKey('copies', 'printer', 1));
    expect(printFileKey('copies', null, 1)).not.toBe(printFileKey('copies', 'printer', 1));
    expect(printFileKey('qr', null, 2)).not.toBe(printFileKey('qr', null, 3));
  });

  it('ties the sticker stamp to the content only while later sheets get spots', () => {
    const plain = (content: string) => printStamps(content, 'students', settings({ stickerSpots: 'cover' })).qr;
    const spots = (content: string) => printStamps(content, 'students', settings({ stickerSpots: 'sheet' })).qr;
    expect(plain('a')).toBe(plain('b'));
    expect(plain('a')).toBe(printStamps('a', 'students').qr);
    expect(spots('a')).not.toBe(spots('b'));
  });
});

describe('extra paper settings (issue #228)', () => {
  it('reads unknown paper as empty and clamps the extra pages to 0..20', () => {
    expect(printSettingsOf({ paperStyle: 'zigzag' as never }).paperStyle).toBe('empty');
    expect(printSettingsOf({ paperStyle: 'dotted' }).paperStyle).toBe('dotted');
    expect(printSettingsOf({}).dottedFields).toBe(false);
    expect(printSettingsOf({ dottedFields: true }).dottedFields).toBe(true);
    expect(printSettingsOf({ paperStyle: 'lined' }).paperStyle).toBe('lined');
    expect([clampExtraPages(-3), clampExtraPages('4'), clampExtraPages(2.7), clampExtraPages(99), clampExtraPages('x')]).toEqual([0, 4, 2, 20, 0]);
  });

  it('keys the extra sheet by its paper', () => {
    expect(printFileKey('extra', null, 0, 'lined')).not.toBe(printFileKey('extra', null, 0, 'squared'));
  });
});

describe('booklet offset (issue #228)', () => {
  it('keeps the shift in half millimetres within ±10 mm', () => {
    expect(clampBookletOffset('1,3')).toBe(1.5);
    expect(clampBookletOffset(-14)).toBe(-10);
    expect(clampBookletOffset('x')).toBe(0);
    expect(Object.is(clampBookletOffset('-0.1'), -0)).toBe(false);
  });

  it('makes imposed sheets again for a new shift, other files not', () => {
    expect(printFileKey('exam', 'impose', 0, 'empty', 1.5)).not.toBe(printFileKey('exam', 'impose', 0, 'empty', 0));
    expect(printFileKey('exam', 'printer', 0, 'empty', 1.5)).toBe(printFileKey('exam', 'printer', 0, 'empty', 0));
  });
});

describe('digital grading off (issue #228)', () => {
  it('prints no corner markers and keeps personalised copies with their cut corner (issue #272)', async () => {
    const { withExamOptions } = await import('../src/lib/exam/examPreview');
    const exam = { pageCodes: true, printMode: 'copies', digitalGrading: false, resultsQrBox: true, nameLine: true } as const;
    expect(printSettingsOf(exam)).toMatchObject({ mode: 'copies', pageCodes: true, digitalGrading: false, cutCorner: true, foldStrip: false });
    const options = withExamOptions('sans', exam).split(',');
    expect(options).toEqual(expect.arrayContaining(['namenszeile', 'ohnemarken', 'ergebnisqr', 'seitencode']));
    expect(options).not.toContain('ohneecke');
    expect(withExamOptions('sans', { pageCodes: true })).not.toMatch(/ohne/);
  });

  it('switches each scan aid on its own (issue #272)', async () => {
    const { withExamOptions } = await import('../src/lib/exam/examPreview');
    const opts = (exam: Parameters<typeof withExamOptions>[1]) => withExamOptions('sans', exam).split(',');
    expect(opts({ cutCorner: false })).toEqual(['sans', 'ohneecke']);
    expect(opts({ printLayout: 'booklet', foldStrip: false })).toEqual(['sans', 'broschuere', 'ohnefalz']);
    // A duplex exam has no fold strip to switch off.
    expect(opts({ foldStrip: false })).toEqual(['sans']);
    // Records from before the switches print as before: paper grading without cut corner and fold strip.
    expect(printSettingsOf({ digitalGrading: false })).toMatchObject({ cutCorner: false, foldStrip: false });
    expect(opts({ digitalGrading: false, printLayout: 'booklet' })).toEqual(expect.arrayContaining(['ohnemarken', 'ohneecke', 'ohnefalz']));
  });
});
