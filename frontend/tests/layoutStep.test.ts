import { describe, expect, it } from 'vitest';
import { LAYOUT_PRESETS, matchPreset } from '../src/lib/exam/layoutPresets';
import { NEW_EXAM_PRINT, printSettingsOf, printsNameLine } from '../src/lib/exam/printLayout';
import { focusPageOf, nameInfoOf, pageElementsOf, sheetSketchOf } from '../src/lib/exam/sheetSketch';
import { layoutSampleTex, SAMPLE_MC_URI, SAMPLE_REST_URI } from '../src/lib/exam/layoutSample';
import { withExamOptions } from '../src/lib/exam/examPreview';

const preset = (id: string) => LAYOUT_PRESETS.find((p) => p.id === id)!.fields;

describe('layout presets (issue #272)', () => {
  it('a new exam matches "grade in Examance"', () => {
    expect(matchPreset({ ...NEW_EXAM_PRINT, nameLine: false, mcCorrectionHint: true })).toBe('fullDigital');
  });

  it('every preset matches itself and nothing else', () => {
    for (const p of LAYOUT_PRESETS) expect(matchPreset(p.fields)).toBe(p.id);
  });

  it('paper grading ignores the stored page codes and sticker spots', () => {
    expect(matchPreset({ ...preset('anonymousPaper'), pageCodes: false, stickerSpots: 'cover' })).toBe('anonymousPaper');
  });

  it('a changed option makes the settings custom', () => {
    expect(matchPreset({ ...preset('fullDigital'), stickerSpots: 'cover' })).toBe('custom');
  });
});

describe('name line without Examance grading (issue #272)', () => {
  const offline = (resultsQrBox: boolean) => printSettingsOf({ digitalGrading: false, resultsQrBox });

  it('an anonymous paper cover prints only the QR box', () => {
    expect(printsNameLine(offline(true), false)).toBe(false);
    expect(withExamOptions('', { digitalGrading: false, resultsQrBox: true, nameLine: false }).split(',')).not.toContain('namenszeile');
  });

  it('a cover without QR box always gets a name line', () => {
    expect(printsNameLine(offline(false), false)).toBe(true);
    expect(withExamOptions('', { digitalGrading: false, resultsQrBox: false, nameLine: false }).split(',')).toContain('namenszeile');
  });

  it('digital grading prints the line only when asked', () => {
    expect(printsNameLine(printSettingsOf({}), false)).toBe(false);
    expect(printsNameLine(printSettingsOf({}), true)).toBe(true);
  });
});

describe('layout preview pages (issue #272)', () => {
  it('draws the scan aids and stickers of digital grading', () => {
    const model = sheetSketchOf({ ...NEW_EXAM_PRINT }, false);
    expect(model).toMatchObject({ scanAids: true, pageCodes: true, qr: 'sticker', initials: true, nameLine: false, layout: 'duplex', sheets: 2 });
    expect(model.pages.map((p) => p.role)).toEqual(['cover', 'exercises', 'last', 'filler']);
    expect(model.pages.filter((p) => p.stickerSpot).map((p) => p.number)).toEqual([3]);
    expect(model.pages.map((p) => p.cutSide)).toEqual(['right', 'left', 'right', 'left']);
  });

  it('extra pages come before the filler pages that fill whole sheets', () => {
    const duplex = sheetSketchOf({ ...NEW_EXAM_PRINT, extraPages: 2 }, false);
    expect(duplex.pages.map((p) => p.role)).toEqual(['cover', 'exercises', 'last', 'extra', 'extra', 'filler']);
    const booklet = sheetSketchOf({ ...NEW_EXAM_PRINT, printLayout: 'booklet', stickerSpots: 'a3', extraPages: 1 }, false, 5);
    expect(booklet.pages.map((p) => p.role)).toEqual(['cover', 'exercises', 'exercises', 'exercises', 'last', 'extra', 'filler', 'filler']);
    expect(booklet.sheets).toBe(2);
    expect(booklet.pages[0]!.foldSide).toBe('left');
  });

  it('no filler page when the pages already fill whole sheets', () => {
    expect(sheetSketchOf({ ...NEW_EXAM_PRINT, extraPages: 1 }, false).pages.map((p) => p.role)).toEqual(['cover', 'exercises', 'last', 'extra']);
  });

  it('personalised copies print the QR and need no sticker spots', () => {
    const model = sheetSketchOf({ ...NEW_EXAM_PRINT, printMode: 'copies' }, false);
    expect(model.qr).toBe('printed');
    expect(model.pages.some((p) => p.stickerSpot)).toBe(false);
  });

  it('paper grading drops every scan aid, whatever is stored', () => {
    const model = sheetSketchOf({ ...NEW_EXAM_PRINT, digitalGrading: false, resultsQrBox: false, printLayout: 'booklet', stickerSpots: 'leaf' }, true);
    expect(model).toMatchObject({ scanAids: false, pageCodes: false, qr: 'none', nameLine: true, logo: true, layout: 'booklet' });
    expect(model.pages.some((p) => p.stickerSpot || p.foldSide)).toBe(false);
  });

  it('an option shows on the page it changes', () => {
    const model = sheetSketchOf({ ...NEW_EXAM_PRINT, extraPages: 1 }, false);
    expect(focusPageOf('name', model)).toBe(1);
    expect(focusPageOf('pageCodes', model)).toBe(2);
    expect(focusPageOf('stickers', model)).toBe(3);
    expect(focusPageOf('paper', model)).toBe(4);
  });
});

describe('layout sample (issue #272)', () => {
  it('prints the QR box and name line without scan aids, and marks its rest area', () => {
    const tex = layoutSampleTex();
    const options = /\\usepackage\[([^\]]*)\]\{sty\/Schulaufgabe\}/.exec(tex)![1]!.split(',');
    expect(options).toEqual(expect.arrayContaining(['ohnescan', 'ergebnisqr', 'namenszeile']));
    expect(options).not.toContain('seitencode');
    expect(options).not.toContain('broschuere');
    expect(tex).toContain(SAMPLE_REST_URI);
    expect(tex).toContain(SAMPLE_MC_URI);
  });

  it('never glues text onto a control word (\\parLorem broke the compile)', () => {
    const tex = layoutSampleTex();
    expect(tex).not.toMatch(/\\par[A-Za-z]/);
    for (const uri of [SAMPLE_MC_URI, SAMPLE_REST_URI]) expect(tex).toMatch(new RegExp(`${uri}\\}.*\\\\par\\n`));
  });
});

describe('personalised copies without Examance grading (issue #272)', () => {
  const paperCopies = { digitalGrading: false, printMode: 'copies' as const, resultsQrBox: false, nameLine: false };

  it('keeps the copies and the QR box they stamp into', () => {
    expect(printSettingsOf(paperCopies)).toMatchObject({ mode: 'copies', resultsQrBox: true, digitalGrading: false });
    const options = withExamOptions('', paperCopies).split(',');
    expect(options).toEqual(expect.arrayContaining(['ohnescan', 'ergebnisqr']));
    expect(options).not.toContain('namenszeile');
  });

  it('has its own preset, distinct from anonymous stickers', () => {
    expect(matchPreset(preset('anonymousPaperCopies'))).toBe('anonymousPaperCopies');
    expect(matchPreset(preset('anonymousPaper'))).toBe('anonymousPaper');
  });

  it('prints the QR code and names the student only on the cut-off corner', () => {
    const model = sheetSketchOf({ ...NEW_EXAM_PRINT, ...paperCopies }, false);
    expect(model.qr).toBe('printed');
    expect(nameInfoOf(model)).toEqual({ places: ['cornerTab'], visibleOnGraded: false });
  });
});

describe('where the name appears (issue #272)', () => {
  it('stickers name the student on the cover and on later sheets', () => {
    expect(nameInfoOf(sheetSketchOf({ ...NEW_EXAM_PRINT }, false))).toEqual({ places: ['sticker', 'stickerSpots'], visibleOnGraded: true });
  });

  it('a name line is written by hand and stays', () => {
    const info = nameInfoOf(sheetSketchOf({ ...NEW_EXAM_PRINT, digitalGrading: false, resultsQrBox: false, nameLine: false }, false));
    expect(info).toEqual({ places: ['nameLine'], visibleOnGraded: true });
  });

  it('a paper QR box only carries the sticker', () => {
    expect(nameInfoOf(sheetSketchOf({ ...NEW_EXAM_PRINT, digitalGrading: false, resultsQrBox: true, nameLine: false }, false)).places).toEqual(['sticker']);
  });

  it('lists the elements of each page in badge order', () => {
    const model = sheetSketchOf({ ...NEW_EXAM_PRINT, mcCorrectionHint: true, extraPages: 1 }, false);
    expect(pageElementsOf(model, model.pages[0]!)).toEqual(['scanAids', 'pageCodes', 'qr']);
    expect(pageElementsOf(model, model.pages[1]!)).toEqual(['scanAids', 'pageCodes', 'mcHint']);
    expect(pageElementsOf(model, model.pages[2]!, false)).toEqual(['scanAids', 'pageCodes', 'stickers', 'notes', 'paper']);
    expect(pageElementsOf(model, model.pages[3]!)).toEqual(['scanAids', 'pageCodes', 'notes', 'paper']);
    const booklet = sheetSketchOf({ ...NEW_EXAM_PRINT, printLayout: 'booklet', stickerSpots: 'a3' }, false);
    expect(pageElementsOf(booklet, booklet.pages[0]!)).toContain('fold');
  });
});
