import { describe, expect, it } from 'vitest';
import { caretFor, glyphTarget, locateWord, rangeOf, resolveClick, selectionFor, wordInItems, type WordProbe } from '../src/lib/latex/clickToSource';
import { toCompiled, toCurrent } from '../src/lib/latex/inlineEdit/textMap';
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

describe('resolveClick, caretFor and selectionFor with the engine\'s character positions', () => {
  // Body (range starts at main.tex line 4, so body line n is main.tex line n + 3):
  //   2: "Die Katze sieht die Maus"   3: "effiziente Mauskatze"
  // Printed line A (baseline 90): Die Katze sieht die Maus effi- (hyphenated, "ffi" one ligature glyph); printed line B (baseline 104): ziente Mauskatze.
  // A template title "Aufgabe" sits at baseline 60.
  const SRC = 'Erste Zeile\nDie Katze sieht die Maus\neffiziente Mauskatze';
  const packed = (line: number, col: number) => line * 4096 + col;
  type W = { x: number; y: number; widths: number[]; chars: number[]; clusters?: number[]; text: string };
  const word = (x: number, y: number, bodyLine: number | null, col: number, text: string, widths?: number[], clusters?: number[]): W => ({
    x,
    y,
    widths: widths ?? [...text].map(() => 4),
    chars: [...text].map((_, i) => (bodyLine === null ? 0 : packed(bodyLine + 3, col + i))),
    clusters,
    text,
  });
  const WORDS: W[] = [
    word(72, 60, null, 0, 'Aufgabe'),
    word(72, 90, 2, 0, 'Die'),
    word(90, 90, 2, 4, 'Katze'),
    word(120, 90, 2, 10, 'sieht'),
    word(150, 90, 2, 16, 'die'),
    word(168, 90, 2, 20, 'Maus'),
    // "effi": e (4 pt) and the ffi ligature (12 pt), clusters 0 and 1.
    word(190, 90, 3, 0, 'effi', [4, 12], [0, 1]),
    // The hyphen of the break: one glyph, no source.
    { x: 206, y: 90, widths: [3], chars: [0], clusters: [0], text: '-' },
    // A TikZ label whose characters got the position of whatever was read when the macro rebuilt them: the source disagrees, so they are dropped.
    word(300, 90, 2, 4, 'Hund'),
    word(72, 104, 3, 4, 'ziente'),
    word(100, 104, 3, 11, 'Mauskatze'),
  ];
  const line = (w: W) => {
    let at = 0;
    const offsets = w.widths.map((width) => ((at += width), at - width));
    const width = w.widths.reduce((a, b) => a + b, 0);
    return `w 1 ${sp(w.x)} ${sp(w.y)} ${sp(width)} ${sp(10)} ${w.widths.length} ${offsets.map(sp).join(' ')} | ${w.chars.length} ${w.chars.join(' ')} | ${(w.clusters ?? w.widths.map((_, i) => i)).join(' ')} | ${[...w.text].map((c) => c.charCodeAt(0)).join(' ')}`;
  };
  const columnSynctex = new TextEncoder().encode(
    ['SyncTeX Version:1', 'Input:1:./main.tex', 'Output:xdv', 'Magnification:1000', 'Unit:1', 'X Offset:0', 'Y Offset:0', 'Content:', '{1', `[1,${packed(1, 4095)}:0,0:${sp(595)},${sp(842)},0`, ']', '}1', ''].join('\n'),
  );
  const res = {
    pdfBytes: new Uint8Array(),
    synctex: columnSynctex,
    synctexLineShift: 0,
    synctexColumns: true,
    provenance: new TextEncoder().encode(`${WORDS.map(line).join('\n')}\n`),
    sourceRanges: ranges,
  };
  const click = (x: number, y: number) => resolveClick(res, { page: 1, x, y }, null, () => SRC);

  it('puts the cursor before the clicked character, or after it on its right half', () => {
    // "die" at 150: d 150-154, i 154-158.
    expect(click(155, 88)).toEqual({ kind: 'source', exerciseId: 'e1', label: 'Bruch', line: 2, column: 17 });
    expect(click(157, 88)).toMatchObject({ line: 2, column: 18 });
  });

  it('finds the first and last word of a printed line and a word that starts a source line', () => {
    expect(click(73, 88)).toMatchObject({ line: 2, column: 0 });
    expect(click(183, 88)).toMatchObject({ line: 2, column: 24 });
    // "ziente" is the first word of printed line B; "effi" starts source line 3.
    expect(click(73, 102)).toMatchObject({ line: 3, column: 4 });
    expect(click(191, 88)).toMatchObject({ line: 3, column: 0 });
  });

  it('splits a ligature among its characters and puts a click on the hyphen at the end of the broken word', () => {
    // The ffi glyph spans 194-206: f 194-198, f 198-202, i 202-206.
    expect(click(199, 88)).toMatchObject({ line: 3, column: 2 });
    expect(click(205, 88)).toMatchObject({ line: 3, column: 4 });
    expect(click(208, 88)).toMatchObject({ line: 3, column: 4 });
  });

  it('treats clicks beside the text like a text editor; words without a confirmed position go to the PDF lookup', () => {
    expect(click(250, 88)).toMatchObject({ line: 3, column: 4 });
    expect(click(20, 104)).toMatchObject({ line: 3, column: 4 });
    // Well below the text, with no word there in the PDF: the nearest line.
    expect(click(155, 140)).toMatchObject({ line: 3, column: 20 });
    expect(glyphTarget(res, { page: 1, x: 155, y: 140 }, () => SRC)).toBeNull();
    expect(glyphTarget(res, { page: 1, x: 80, y: 58 }, () => SRC)).toBeNull();
    expect(glyphTarget(res, { page: 1, x: 302, y: 88 }, () => SRC)).toBeNull();
  });

  it('places the caret at a character, inside a ligature and after the text before a space or line end', () => {
    expect(caretFor(res, 'e1', 2, 17, () => SRC)!.x).toBeCloseTo(154, 1);
    expect(caretFor(res, 'e1', 3, 2, () => SRC)!.x).toBeCloseTo(198, 1);
    // The first character of a word and of a printed line: before it, not after the word before (regression: the exact match looked one entry too early).
    expect(caretFor(res, 'e1', 2, 4, () => SRC)!.x).toBeCloseTo(90, 1);
    expect(caretFor(res, 'e1', 3, 4, () => SRC)!.x).toBeCloseTo(72, 1);
    // The space after "Die" and the end of line 2.
    expect(caretFor(res, 'e1', 2, 3, () => SRC)!.x).toBeCloseTo(84, 1);
    expect(caretFor(res, 'e1', 2, 24, () => SRC)!.x).toBeCloseTo(184, 1);
    // Nothing of the body before line 1, column 3 is typeset.
    expect(caretFor(res, 'e1', 1, 3, () => SRC)).toBeNull();
  });

  it('draws a selection across a line break as one box per printed line', () => {
    const boxes = selectionFor(res, 'e1', { line: 2, column: 20 }, { line: 3, column: 6 }, () => SRC);
    expect(boxes.map((b) => [b.x, b.x + b.width].map((v) => Math.round(v)))).toEqual([
      [168, 206],
      [72, 80],
    ]);
  });
});

describe('textMap', () => {
  const compiled = 'Die Maus\nsieht die Katze';
  const current = 'Die kleine Maus\nsieht die Katze';
  it('maps positions across text typed since the compile', () => {
    expect(toCurrent(compiled, current, { line: 1, column: 2 })).toEqual({ line: 1, column: 2 });
    expect(toCurrent(compiled, current, { line: 1, column: 5 })).toEqual({ line: 1, column: 12 });
    expect(toCurrent(compiled, current, { line: 2, column: 3 })).toEqual({ line: 2, column: 3 });
    expect(toCompiled(compiled, current, { line: 1, column: 12 })).toEqual({ line: 1, column: 5 });
    // Inside the typed text: where it starts in the compiled text.
    expect(toCompiled(compiled, current, { line: 1, column: 7 })).toEqual({ line: 1, column: 4 });
  });

  it('puts a position inside replaced text where the replacement starts', () => {
    // "Maus" replaced by "Katze": inside the new word the compiled position is the start of the old one.
    expect(toCompiled('Die Maus', 'Die Katze', { line: 1, column: 7 })).toEqual({ line: 1, column: 4 });
  });

  it('keeps every position when nothing changed', () => {
    expect(toCurrent(compiled, compiled, { line: 2, column: 4 })).toEqual({ line: 2, column: 4 });
  });
});
