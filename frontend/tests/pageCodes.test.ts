import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import { EXTRA_SHEET_CODE, examTag, extraSheetCodesLatex, isExtraSheetCode, pageCodeText, pageCodesLatex, parsePageCode, qrRuns } from '../src/lib/exam/pageCodes';

describe('page codes (issue #220)', () => {
  it('tags an exam with eight upper-case hex characters', () => {
    expect(examTag('1a2b3c4d-5e6f-7a8b-9c0d-ef1234567890')).toBe('1A2B3C4D');
  });

  it('round-trips plain and personalised codes', () => {
    expect(parsePageCode(pageCodeText({ tag: '1A2B3C4D', page: 7 }))).toEqual({ tag: '1A2B3C4D', page: 7 });
    expect(parsePageCode(pageCodeText({ tag: '1A2B3C4D', page: 2, id: 'ABC123' }))).toEqual({ tag: '1A2B3C4D', page: 2, id: 'ABC123' });
  });

  it('keeps personalised codes at QR version 2 with level Q, for sticker and LMS ids (readable at 200 ppi, 14 mm)', () => {
    for (const id of ['A1B2C3', 'x7k2pq', '1234567890']) {
      expect(QRCode.create(pageCodeText({ tag: '1A2B3C4D', page: 38, id }), { errorCorrectionLevel: 'Q' }).version).toBeLessThanOrEqual(2);
    }
  });

  it('leaves name stickers and malformed codes alone', () => {
    expect(parsePageCode('Mustermann, Max_ABC123')).toBeNull();
    expect(parsePageCode('EXM1:1A2B3C4D:0')).toBeNull();
    expect(parsePageCode('EXM1:xyz:3')).toBeNull();
  });

  it('keeps the plain code in the smallest symbol', () => {
    expect(QRCode.create(pageCodeText({ tag: '1A2B3C4D', page: 40 }), { errorCorrectionLevel: 'Q' }).version).toBe(1);
  });

  it('draws every dark module exactly once, from the lower left', () => {
    const text = pageCodeText({ tag: '1A2B3C4D', page: 3 });
    const { modules } = QRCode.create(text, { errorCorrectionLevel: 'Q' });
    const { grid, runs } = qrRuns(text);
    expect(grid).toBe(modules.size + 2);
    const dark = new Set<string>();
    for (const run of runs.split(',')) {
      const [x, y, w] = run.split('/').map(Number);
      for (let i = 0; i < w; i++) dark.add(`${x + i - 1},${modules.size - y}`);
    }
    let expected = 0;
    for (let r = 0; r < modules.size; r++) for (let c = 0; c < modules.size; c++) if (modules.get(r, c)) {
      expected++;
      expect(dark.has(`${c},${r}`)).toBe(true);
    }
    expect(dark.size).toBe(expected);
  });

  it('defines one code per page', () => {
    expect(pageCodesLatex('1a2b3c4d-0000-0000-0000-000000000000', 3).split('\n')).toHaveLength(3);
  });
});

describe('extra sheet code (issue #228)', () => {
  it('names no exam and no page, and is no exam page code', () => {
    expect(EXTRA_SHEET_CODE).toBe('EXM1:X');
    expect(isExtraSheetCode(' EXM1:X ')).toBe(true);
    expect(isExtraSheetCode('EXM1:1A2B3C4D:1')).toBe(false);
    expect(parsePageCode(EXTRA_SHEET_CODE)).toBeNull();
  });

  it('stays at QR version 1 and goes on both sides', () => {
    expect(QRCode.create(EXTRA_SHEET_CODE, { errorCorrectionLevel: 'Q' }).version).toBe(1);
    expect(extraSheetCodesLatex().split('\n').map((l) => l.slice(0, 14))).toEqual(['\\Seitencode{1}', '\\Seitencode{2}']);
  });
});
