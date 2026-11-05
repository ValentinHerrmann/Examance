import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import { examTag, pageCodeText, pageCodesLatex, parsePageCode, qrRuns } from '../src/lib/exam/pageCodes';

describe('page codes (issue #220)', () => {
  it('tags an exam with eight upper-case hex characters', () => {
    expect(examTag('1a2b3c4d-5e6f-7a8b-9c0d-ef1234567890')).toBe('1A2B3C4D');
  });

  it('round-trips plain and personalised codes, sticker text with colons included', () => {
    expect(parsePageCode(pageCodeText({ tag: '1A2B3C4D', page: 7 }))).toEqual({ tag: '1A2B3C4D', page: 7 });
    const sticker = 'Muster: Mann, Max_ABC123';
    expect(parsePageCode(pageCodeText({ tag: '1A2B3C4D', page: 2, sticker }))).toEqual({ tag: '1A2B3C4D', page: 2, sticker });
  });

  it('leaves name stickers and malformed codes alone', () => {
    expect(parsePageCode('Mustermann, Max_ABC123')).toBeNull();
    expect(parsePageCode('EXM1:1A2B3C4D:0')).toBeNull();
    expect(parsePageCode('EXM1:xyz:3')).toBeNull();
  });

  it('keeps the plain code in the smallest symbol', () => {
    expect(QRCode.create(pageCodeText({ tag: '1A2B3C4D', page: 40 }), { errorCorrectionLevel: 'M' }).version).toBe(1);
  });

  it('draws every dark module exactly once, from the lower left', () => {
    const text = pageCodeText({ tag: '1A2B3C4D', page: 3 });
    const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
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
