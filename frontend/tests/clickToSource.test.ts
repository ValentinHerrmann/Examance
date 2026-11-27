import { describe, expect, it } from 'vitest';
import { insertedText, locateWord, placeOfLine, rangeOf, resolveClick, wordInItems } from '../src/lib/latex/clickToSource';
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
const result = (mainLine: number, shift = 0) => ({ pdfBytes: new Uint8Array(), synctex: synctex(mainLine), synctexLineShift: shift, sourceRanges: ranges });

describe('resolveClick', () => {
  it('maps a click on exercise text to its line and the clicked word', () => {
    const target = resolveClick(result(5), { page: 1, x: 100, y: 85 }, 'word', () => BODY);
    expect(target).toEqual({ kind: 'source', exerciseId: 'e1', label: 'Bruch', line: 2, column: 7 });
  });

  it('subtracts the lines the format wrapper inserted', () => {
    const target = resolveClick(result(9, 4), { page: 1, x: 100, y: 85 }, 'word', () => BODY);
    expect(target).toMatchObject({ kind: 'source', line: 2, column: 7 });
  });

  it('calls template files and unmarked lines template text', () => {
    expect(resolveClick(result(5), { page: 1, x: 100, y: 40 }, 'x', () => BODY)).toEqual({ kind: 'template' });
    expect(resolveClick(result(2), { page: 1, x: 100, y: 85 }, 'x', () => BODY)).toEqual({ kind: 'template' });
  });

  it('answers null without SyncTeX or off the text', () => {
    expect(resolveClick({ ...result(5), synctex: undefined }, { page: 1, x: 100, y: 85 }, 'word', () => BODY)).toBeNull();
    expect(resolveClick(result(5), { page: 2, x: 100, y: 85 }, 'word', () => BODY)).toBeNull();
  });
});

describe('locateWord', () => {
  it('falls back to a neighbouring line of the same body', () => {
    expect(locateWord(BODY.split('\n'), 1, 'third')).toEqual({ line: 3, column: 0 });
    expect(locateWord(BODY.split('\n'), 2, 'missing')).toEqual({ line: 2, column: 0 });
    expect(locateWord(BODY.split('\n'), 2, null)).toEqual({ line: 2, column: 0 });
  });
});

describe('placeOfLine', () => {
  it('finds where a body line was typeset, with and without the format shift', () => {
    expect(placeOfLine(result(5), rangeOf(result(5), 'e1')!, 2)).toMatchObject({ page: 1, x: expect.closeTo(72, 1), y: expect.closeTo(90, 1) });
    expect(placeOfLine(result(9, 4), ranges[0], 2)).toMatchObject({ page: 1 });
  });

  it('takes the only range for a document marked without ids', () => {
    const single = { ...result(5), sourceRanges: [{ ...ranges[0], exerciseId: null }] };
    expect(rangeOf(single, null)).toBe(single.sourceRanges[0]);
  });
});

describe('insertedText', () => {
  it('returns what was typed between the unchanged ends', () => {
    expect(insertedText('Hallo Welt', 'Hallo schöne Welt')).toBe('schöne ');
    expect(insertedText('abc', 'abc')).toBe('');
    expect(insertedText('', 'neu')).toBe('neu');
  });
});

describe('wordInItems', () => {
  const items = [{ str: 'hello world', transform: [1, 0, 0, 1, 72, 700], width: 55, height: 10 }];
  it('finds the word under the point (top-left frame against pdf.js baselines)', () => {
    expect(wordInItems(items, 842, 112, 842 - 702)).toBe('world');
    expect(wordInItems(items, 842, 74, 842 - 702)).toBe('hello');
    expect(wordInItems(items, 842, 300, 842 - 702)).toBeNull();
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
