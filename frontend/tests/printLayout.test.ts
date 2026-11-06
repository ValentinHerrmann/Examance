import { describe, expect, it } from 'vitest';
import { clampBookletOffset, clampExtraPages, printFileKey, printSettingsOf, stickerPagesOf, stickersPerCopy, type PrintSettings } from '../src/lib/exam/printLayout';
import { printStamps } from '../src/lib/exam/examChecks';

const settings = (patch: Partial<PrintSettings>): PrintSettings => ({ pageCodes: true, layout: 'duplex', mode: 'stickers', stickerSpots: 'sheet', paperStyle: 'squared', extraPages: 0, bookletOffsetMm: 0, ...patch });

describe('print settings (issue #220)', () => {
  it('reads older exams as the old layout', () => {
    expect(printSettingsOf({})).toEqual({ pageCodes: false, layout: 'duplex', mode: 'stickers', stickerSpots: 'cover', paperStyle: 'empty', extraPages: 0, bookletOffsetMm: 0 });
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
    expect(printSettingsOf({ paperStyle: 'dotted' as never }).paperStyle).toBe('empty');
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
