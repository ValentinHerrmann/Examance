import { describe, expect, it } from 'vitest';
import { allScanAidsOn, effectiveTemplates, LAYOUT_PRESETS, matchPreset, replacedTexts, withSlot } from '../src/lib/exam/layoutPresets';
import { LAYOUT_FIELDS, LAYOUT_TEXT_FIELDS } from '../src/lib/exam/saveExamLayout';
import { DEFAULT_EXTRA_NOTES } from '../src/lib/db/schema';
import { NEW_EXAM_PRINT, printSettingsOf, printsNameLine } from '../src/lib/exam/printLayout';
import { focusPageOf, infoTextLines, nameInfoOf, pageElementsOf, sheetSketchOf } from '../src/lib/exam/sheetSketch';
import { layoutSampleTex, SAMPLE_INFO_END_URI, SAMPLE_INFO_START_URI, SAMPLE_LABEL, SAMPLE_MC_URI, SAMPLE_REST_URI } from '../src/lib/exam/layoutSample';
import { printedLabel } from '../src/lib/qr/stickerSheet';
import { printedExtension } from '../src/lib/students/timeExtension';
import { withExamOptions } from '../src/lib/exam/examPreview';

const preset = (id: string) => LAYOUT_PRESETS.find((p) => p.id === id)!.fields;

describe('layout templates (issues #272, #279)', () => {
  it('a new exam with the MC hint matches "Examance, anonymous"', () => {
    expect(matchPreset({ ...NEW_EXAM_PRINT, nameLine: false, mcCorrectionHint: true })).toBe('examanceAnonymous');
  });

  it('every template matches itself and nothing else', () => {
    for (const p of LAYOUT_PRESETS) expect(matchPreset(p.fields)).toBe(p.id);
  });

  it('every built-in sets every Layout choice and leaves the free text alone', () => {
    for (const p of LAYOUT_PRESETS) {
      for (const key of LAYOUT_FIELDS) expect(key in p.fields).toBe(!(LAYOUT_TEXT_FIELDS as readonly string[]).includes(key));
    }
  });

  it('knows when every scan aid is on (the fold strip counts only in a booklet)', () => {
    expect(allScanAidsOn(preset('examanceAnonymous'))).toBe(true);
    expect(allScanAidsOn({ ...preset('examanceAnonymous'), foldStrip: false })).toBe(true);
    expect(allScanAidsOn({ ...preset('examanceBooklet'), foldStrip: false })).toBe(false);
    expect(allScanAidsOn(preset('paperAnonymous'))).toBe(false);
  });

  it('sticker spots do not decide the match of personalised copies', () => {
    expect(matchPreset({ ...preset('examanceBooklet'), stickerSpots: 'leaf' })).toBe('examanceBooklet');
  });

  it('a changed option or paper makes the settings custom; free text does not', () => {
    expect(matchPreset({ ...preset('examanceAnonymous'), stickerSpots: 'cover' })).toBe('custom');
    expect(matchPreset({ ...preset('examanceAnonymous'), paperStyle: 'lined' })).toBe('custom');
    expect(matchPreset({ ...preset('examanceAnonymous'), infoText: 'Hilfsmittel: keine' } as never)).toBe('examanceAnonymous');
  });
});

describe('edited layout templates (issue #279)', () => {
  it('an account change replaces the built-in and keeps the slot order', () => {
    const tpls = effectiveTemplates([{ id: 'paperClassic', title: 'Ex', fields: { printLayout: 'booklet', infoText: '45 min' } }]);
    expect(tpls.map((t) => t.id)).toEqual(LAYOUT_PRESETS.map((p) => p.id));
    const own = tpls.find((t) => t.id === 'paperClassic')!;
    expect(own).toMatchObject({ title: 'Ex', text: null, edited: true });
    expect(own.fields).toMatchObject({ ...preset('paperClassic'), printLayout: 'booklet', infoText: '45 min' });
    expect(matchPreset(own.fields, tpls)).toBe('paperClassic');
  });

  it('a setting missing from an older save or of the wrong type keeps the built-in value', () => {
    const [own] = effectiveTemplates([{ id: 'examanceBooklet', fields: { nameLine: 'yes', printMode: 'nonsense', stickerSpots: 'roof', extraPages: 99 } }]);
    expect(own.fields).toMatchObject({ ...preset('examanceBooklet'), extraPages: 20 });
  });

  it('merges a change into its slot, keeps the others and drops a slot left empty', () => {
    const stored = [{ id: 'paperClassic' as const, title: 'Ex' }, { id: 'examanceBooklet' as const, fields: { extraPages: 2 } }];
    expect(withSlot(stored, 'examanceBooklet', { title: 'Abi' })).toEqual([stored[0], { id: 'examanceBooklet', fields: { extraPages: 2 }, title: 'Abi' }]);
    expect(withSlot(stored, 'paperClassic', { title: null, text: null })).toEqual([stored[1]]);
    expect(withSlot(stored, 'paperAnonymous', { title: null, text: null })).toEqual(stored);
    expect(withSlot(stored, 'examanceBooklet', null)).toEqual([stored[0]]);
  });

  it('asks before replacing the exam\'s own text only', () => {
    const fields = { ...preset('paperClassic'), infoText: 'Template', extraNotes: null };
    expect(replacedTexts(preset('paperClassic'), { infoText: 'Mine' })).toEqual([]);
    expect(replacedTexts(fields, { infoText: '' })).toEqual([]);
    expect(replacedTexts(fields, { infoText: 'Template' })).toEqual([]);
    expect(replacedTexts(fields, { infoText: 'Mine', extraNotes: DEFAULT_EXTRA_NOTES })).toEqual(['infoText', 'extraNotes']);
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
    expect(model).toMatchObject({ markers: true, cutCorner: true, pageCodes: true, qr: 'sticker', initials: true, nameLine: false, layout: 'duplex', sheets: 2 });
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

  it('each scan aid is drawn on its own (issue #272)', () => {
    const model = sheetSketchOf({ ...NEW_EXAM_PRINT, digitalGrading: false, resultsQrBox: false, cutCorner: false, foldStrip: false, pageCodes: false, printLayout: 'booklet', stickerSpots: 'cover' }, true);
    expect(model).toMatchObject({ markers: false, cutCorner: false, pageCodes: false, qr: 'none', nameLine: true, logo: true, layout: 'booklet' });
    expect(model.pages.some((p) => p.stickerSpot || p.foldSide)).toBe(false);
    const codesOnly = sheetSketchOf({ ...NEW_EXAM_PRINT, digitalGrading: false, cutCorner: false }, false);
    expect(codesOnly).toMatchObject({ markers: false, cutCorner: false, pageCodes: true });
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
    expect(options).toEqual(expect.arrayContaining(['ohnemarken', 'ohneecke', 'ergebnisqr', 'namenszeile']));
    expect(options).not.toContain('seitencode');
    expect(options).not.toContain('broschuere');
    expect(tex).toContain(SAMPLE_REST_URI);
    expect(tex).toContain(SAMPLE_MC_URI);
    expect(tex).toContain(SAMPLE_INFO_START_URI);
    expect(tex).toContain(SAMPLE_INFO_END_URI);
  });

  it('prints the working time in the header and a student with a time extension', () => {
    expect(layoutSampleTex()).toContain(String.raw`\Datum{01.01.2027 (30 Minuten + 5 Minuten Einlesezeit)}`);
    const extension = printedExtension({ value: 20, unit: '%' }, 35);
    expect(SAMPLE_LABEL).toBe(printedLabel({ label: 'Mustermann, Max', number: '07', payload: '', extension }));
    expect(SAMPLE_LABEL).toContain('+20 %');
  });

  it('never glues text onto a control word (\\parLorem broke the compile)', () => {
    const tex = layoutSampleTex();
    expect(tex).not.toMatch(/\\par[A-Za-z]/);
    for (const uri of [SAMPLE_MC_URI, SAMPLE_REST_URI, SAMPLE_INFO_START_URI, SAMPLE_INFO_END_URI]) expect(tex).toMatch(new RegExp(`${uri}\\}.*\\\\par\\n`));
  });
});

describe('personalised copies without Examance grading (issue #272)', () => {
  const paperCopies = { digitalGrading: false, printMode: 'copies' as const, resultsQrBox: false, nameLine: false };

  it('keeps the copies and the QR box they stamp into', () => {
    expect(printSettingsOf(paperCopies)).toMatchObject({ mode: 'copies', resultsQrBox: true, digitalGrading: false });
    const options = withExamOptions('', paperCopies).split(',');
    expect(options).toEqual(expect.arrayContaining(['ohnemarken', 'ergebnisqr']));
    expect(options).not.toContain('namenszeile');
    expect(options).not.toContain('ohneecke');
  });

  it('matches no template: anonymous paper uses stickers', () => {
    expect(matchPreset({ ...preset('paperAnonymous'), printMode: 'copies' })).toBe('custom');
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
    expect(nameInfoOf(sheetSketchOf({ ...NEW_EXAM_PRINT, digitalGrading: false, resultsQrBox: true, nameLine: false, stickerSpots: 'cover' }, false)).places).toEqual(['sticker']);
  });

  it('lists the elements of each page in badge order', () => {
    const model = sheetSketchOf({ ...NEW_EXAM_PRINT, mcCorrectionHint: true, extraPages: 1 }, false);
    expect(pageElementsOf(model, model.pages[0]!)).toEqual(['markers', 'cutCorner', 'pageCodes', 'qr']);
    expect(pageElementsOf(model, model.pages[1]!)).toEqual(['markers', 'cutCorner', 'pageCodes', 'mcHint']);
    expect(pageElementsOf(model, model.pages[2]!, false)).toEqual(['markers', 'cutCorner', 'pageCodes', 'stickers', 'notes', 'paper']);
    expect(pageElementsOf(model, model.pages[3]!)).toEqual(['markers', 'cutCorner', 'pageCodes', 'notes', 'paper']);
    const withInfo = sheetSketchOf({ ...NEW_EXAM_PRINT, infoText: 'Hilfsmittel: keine' }, false);
    expect(pageElementsOf(withInfo, withInfo.pages[0]!)).toContain('info');
    const booklet = sheetSketchOf({ ...NEW_EXAM_PRINT, printLayout: 'booklet', stickerSpots: 'a3' }, false);
    expect(pageElementsOf(booklet, booklet.pages[0]!)).toContain('fold');
  });
});

describe('info text in the preview (issue #272)', () => {
  it('reads an itemize as bullet lines and drops commands', () => {
    expect(infoTextLines(String.raw`\begin{itemize}
  \item Hilfsmittel: \textbf{keine}
  \item Zeit~beachten % comment
\end{itemize}`)).toEqual(['• Hilfsmittel: keine', '• Zeit beachten']);
  });

  it('keeps paragraphs and forced line breaks as lines', () => {
    expect(infoTextLines(String.raw`Viel Erfolg!\\ Bitte sauber schreiben.

Taschenrechner erlaubt.`)).toEqual(['Viel Erfolg!', 'Bitte sauber schreiben.', 'Taschenrechner erlaubt.']);
  });

  it('drops math delimiters and spacing commands with their arguments', () => {
    expect(infoTextLines(String.raw`Zeit: $45$\,min\vspace{2mm} \hspace*{1cm}gut`)).toEqual(['Zeit: 45 min gut']);
  });

  it('an empty info text gives no lines', () => {
    expect(infoTextLines('')).toEqual([]);
    expect(infoTextLines('  \n ')).toEqual([]);
  });
});
