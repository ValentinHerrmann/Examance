import { describe, expect, it } from 'vitest';
import { caretFor, locateWord, rangeOf, resolveClick, wordInItems, type WordProbe } from '../src/lib/latex/clickToSource';
import { glyphStarts } from '../src/lib/latex/inlineEdit/glyphMap';
import { printedView } from '../src/lib/latex/printedText';
import { createTapTracker } from '../src/lib/pdf/tap';

/** sp per PDF point (big point). */
const BP = (65536 * 72.27) / 72;
const sp = (bp: number) => Math.round(bp * BP);

/** Page 1: an hbox of main.tex line `mainLine` at y = 90 bp (points at x 72 and 152), and an hbox of the template's .sty at y = 45 bp. */
function synctex(mainLine: number): Uint8Array {
  const text = [
    'SyncTeX Version:1',
    'Input:1:./main.tex',
    'Input:2:/texlive/texmf-dist/tex/latex/sty/Schulaufgabe.sty',
    'Output:xdv',
    'Magnification:1000',
    'Unit:1',
    'X Offset:0',
    'Y Offset:0',
    'Content:',
    '{1',
    `[1,1:0,0:${sp(595)},${sp(842)},0`,
    `(1,${mainLine}:${sp(72)},${sp(90)}:${sp(300)},${sp(10)},0`,
    `x1,${mainLine}:${sp(72)},${sp(90)}`,
    `x1,${mainLine + 1}:${sp(152)},${sp(90)}`,
    ')',
    `(2,3:${sp(72)},${sp(45)}:${sp(300)},${sp(10)},0`,
    `x2,3:${sp(72)},${sp(45)}`,
    ')',
    ']',
    '}1',
    '',
  ].join('\n');
  return new TextEncoder().encode(text);
}

const BODY = 'first line\nsecond word here\nthird';
const ranges = [{ label: 'Bruch', exerciseId: 'e1', start: 4, end: 6 }];
const probe = (word: string, before: string[] = [], after: string[] = []): WordProbe => ({ word, before, after });
const result = (mainLine: number, shift = 0) => ({ pdfBytes: new Uint8Array(), synctex: synctex(mainLine), synctexLineShift: shift, sourceRanges: ranges });

describe('resolveClick', () => {
  it('maps a click on exercise text to its line and the clicked word', () => {
    const target = resolveClick(result(5), { page: 1, x: 100, y: 85 }, probe('word'), () => BODY);
    expect(target).toEqual({ kind: 'source', exerciseId: 'e1', label: 'Bruch', line: 2, column: 7 });
  });

  it('subtracts the lines the format wrapper inserted', () => {
    const target = resolveClick(result(9, 4), { page: 1, x: 100, y: 85 }, probe('word'), () => BODY);
    expect(target).toMatchObject({ kind: 'source', line: 2, column: 7 });
  });

  it('calls template files and unmarked lines template text', () => {
    expect(resolveClick(result(5), { page: 1, x: 100, y: 40 }, probe('x'), () => BODY)).toEqual({ kind: 'template' });
    expect(resolveClick(result(2), { page: 1, x: 100, y: 85 }, probe('x'), () => BODY)).toEqual({ kind: 'template' });
  });

  it('answers null without SyncTeX or off the text', () => {
    expect(resolveClick({ ...result(5), synctex: undefined }, { page: 1, x: 100, y: 85 }, probe('word'), () => BODY)).toBeNull();
    expect(resolveClick(result(5), { page: 2, x: 100, y: 85 }, probe('word'), () => BODY)).toBeNull();
  });
});

describe('locateWord', () => {
  it('searches the whole paragraph, not only the line SyncTeX names', () => {
    expect(locateWord(BODY.split('\n'), 1, probe('third'))).toEqual({ line: 3, column: 0 });
    const para = ['eins zwei', 'drei vier', 'fünf sechs', 'sieben acht', 'neun zehn', 'elf zwölf'];
    expect(locateWord(para, 1, probe('zwölf'))).toEqual({ line: 6, column: 4 });
    expect(locateWord(BODY.split('\n'), 2, probe('missing'))).toEqual({ line: 2, column: 0 });
    expect(locateWord(BODY.split('\n'), 2, null)).toEqual({ line: 2, column: 0 });
  });

  it('stops at blank lines', () => {
    expect(locateWord(['eins', '', 'zwei'], 1, probe('zwei'))).toEqual({ line: 1, column: 0 });
  });

  it('chooses between repeated words by their neighbours', () => {
    const lines = ['Die Katze sieht die Maus, und die Maus sieht die Katze.'];
    expect(locateWord(lines, 1, probe('die', ['Maus', 'sieht'], ['Katze']))).toEqual({ line: 1, column: 45 });
    expect(locateWord(lines, 1, probe('die', ['und'], ['Maus', 'sieht']))).toEqual({ line: 1, column: 30 });
  });

  it('finds words written with accent macros and across macros', () => {
    expect(locateWord(['Die Gr\\"o\\ss{}e ist \\textbf{wichtig}.'], 1, probe('wichtig'))).toEqual({ line: 1, column: 28 });
    expect(locateWord(['Die Gr\\"o\\ss{}e ist gut.'], 1, probe('Größe'))).toEqual({ line: 1, column: 4 });
    expect(locateWord(['ein "Uberblick'], 1, probe('Überblick'))).toEqual({ line: 1, column: 4 });
  });

  it('matches the first part of a word hyphenated at the line end', () => {
    expect(locateWord(['eine Klausuraufgabe hier'], 1, probe('Klausur', ['eine']))).toEqual({ line: 1, column: 5 });
  });
});

describe('printedView', () => {
  it('drops macros, braces and comments and keeps source columns', () => {
    const v = printedView(['a \\emph{bc} % note', 'd~e']);
    expect(v.text).toBe('a bc  d e ');
    expect(v.at[2]).toEqual([1, 8]);
    expect(v.at[6]).toEqual([2, 0]);
  });
});

describe('rangeOf', () => {
  it('takes the only range for a document marked without ids', () => {
    const single = { ...result(5), sourceRanges: [{ ...ranges[0], exerciseId: null }] };
    expect(rangeOf(single, null)).toBe(single.sourceRanges[0]);
  });
});

describe('wordInItems', () => {
  const items = [{ str: 'hello world', transform: [1, 0, 0, 1, 72, 700], width: 55, height: 10 }];
  it('finds the word under the point with its neighbours (top-left frame against pdf.js baselines)', () => {
    expect(wordInItems(items, 842, 112, 842 - 702)).toMatchObject({ word: 'world', before: ['hello'], after: [] });
    expect(wordInItems(items, 842, 74, 842 - 702)).toMatchObject({ word: 'hello', before: [], after: ['world'] });
    expect(wordInItems(items, 842, 300, 842 - 702)).toBeNull();
  });

  it('takes the nearest word on a space and joins the items of one printed line', () => {
    const row = [
      { str: 'Die Katze', transform: [1, 0, 0, 1, 72, 700], width: 45, height: 10 },
      { str: 'schläft', transform: [1, 0, 0, 1, 121, 700], width: 32, height: 10 },
      { str: 'unten', transform: [1, 0, 0, 1, 72, 686], width: 25, height: 10 },
    ];
    expect(wordInItems(row, 842, 89, 842 - 702)?.word).toMatch(/^(Die|Katze)$/);
    expect(wordInItems(row, 842, 130, 842 - 702)).toMatchObject({ word: 'schläft', before: ['Die', 'Katze'], after: [] });
  });

  it('splits ligatures the PDF prints', () => {
    const lig = [{ str: 'die Au\uFB02age', transform: [1, 0, 0, 1, 72, 700], width: 50, height: 10 }];
    expect(wordInItems(lig, 842, 110, 842 - 702)?.word).toBe('Auflage');
  });
});

describe('createTapTracker', () => {
  const ev = (pointerId: number, x: number, t: number, extra: Partial<PointerEvent> = {}) =>
    ({ pointerId, clientX: x, clientY: 0, button: 0, isPrimary: pointerId === 1, timeStamp: t, ...extra }) as PointerEvent;

  it('takes a short, still press as a tap', () => {
    const taps = createTapTracker();
    taps.down(ev(1, 0, 0));
    expect(taps.up(ev(1, 3, 120))).toBe(true);
  });

  it('never takes a pan, a long press or a pinch', () => {
    const taps = createTapTracker();
    taps.down(ev(1, 0, 0));
    expect(taps.up(ev(1, 40, 100))).toBe(false);
    taps.down(ev(1, 0, 0));
    expect(taps.up(ev(1, 0, 900))).toBe(false);
    taps.down(ev(1, 0, 0));
    taps.down(ev(2, 50, 10));
    expect(taps.up(ev(2, 50, 50))).toBe(false);
    expect(taps.up(ev(1, 0, 60))).toBe(false);
    taps.down(ev(1, 0, 100));
    expect(taps.up(ev(1, 0, 150))).toBe(true);
  });
});

describe('resolveClick and caretFor with engine glyphs', () => {
  // main.tex line 5 is body line 2 (range starts at 4): "Die Katze sieht die Maus", spaces at columns 3, 9, 15, 19.
  const SRC = 'Erste Zeile\nDie Katze sieht die Maus\nEnde';
  const packed = (line: number, col: number) => line * 4096 + col;
  // Words on page 1 at baseline 90 pt: [text, left x], 4 pt per glyph.
  const WORDS: [string, number][] = [['Die', 72], ['Katze', 90], ['sieht', 120], ['die', 150], ['Maus', 168]];
  const spaces = [3, 9, 15, 19];
  function columnSynctex(): Uint8Array {
    const sep = (col: number, x: number) => `k1,${packed(5, col)}:${sp(x)},${sp(90)}`;
    const text = [
      'SyncTeX Version:1', 'Input:1:./main.tex', 'Output:xdv', 'Magnification:1000', 'Unit:1', 'X Offset:0', 'Y Offset:0', 'Content:',
      '{1', `[1,${packed(1, 4095)}:0,0:${sp(595)},${sp(842)},0`,
      `(1,${packed(5, 0)}:${sp(72)},${sp(90)}:${sp(300)},${sp(10)},0`,
      ...WORDS.slice(0, 4).map(([t, x], i) => sep(spaces[i], x + t.length * 4)),
      ')', ']', '}1', '',
    ].join('\n');
    return new TextEncoder().encode(text);
  }
  const prov = WORDS.map(([t, x]) => `w 1 ${sp(x)} ${sp(90)} ${sp(t.length * 4)} ${sp(10)} ${t.length} ${[...t].map((_, i) => sp(i * 4)).join(' ')}`).join('\n');
  const res = {
    pdfBytes: new Uint8Array(), synctex: columnSynctex(), synctexLineShift: 0, synctexColumns: true,
    provenance: new TextEncoder().encode(`${prov}\n`), sourceRanges: ranges,
  };

  it('puts the cursor before the clicked glyph of a repeated word', () => {
    // "die" at 150: d 150-154, i 154-158; a click at 155 is on the left half of i.
    expect(resolveClick(res, { page: 1, x: 155, y: 88 }, null, () => SRC)).toEqual({ kind: 'source', exerciseId: 'e1', label: 'Bruch', line: 2, column: 17 });
    // The right half of i: after it.
    expect(resolveClick(res, { page: 1, x: 157, y: 88 }, null, () => SRC)).toMatchObject({ column: 18 });
  });

  it('finds the first word of a printed line from the space after it', () => {
    expect(resolveClick(res, { page: 1, x: 80.5, y: 88 }, null, () => SRC)).toMatchObject({ line: 2, column: 2 });
  });

  it('places the caret at the glyph of a source position', () => {
    const box = caretFor(res, 'e1', 2, 17, () => SRC);
    expect(box).toMatchObject({ page: 1 });
    expect(box!.x).toBeCloseTo(154, 1);
    expect(caretFor(res, 'e1', 2, 1, () => SRC)!.x).toBeCloseTo(76, 1);
    expect(caretFor(res, 'e1', 1, 3, () => SRC)).toBeNull();
  });
});

describe('glyphStarts', () => {
  it('merges ligatures until the glyph count fits', () => {
    expect(glyphStarts('mittleren', 8)).toEqual([0, 1, 2, 4, 5, 6, 7, 8]);
    expect(glyphStarts('Auflage', 6)).toEqual([0, 1, 2, 4, 5, 6]);
    expect(glyphStarts('a--b', 3)).toEqual([0, 1, 3]);
    expect(glyphStarts('Uhr.', 4)).toEqual([0, 1, 2, 3]);
  });
});
