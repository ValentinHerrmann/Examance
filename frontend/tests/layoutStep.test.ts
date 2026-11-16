import { describe, expect, it } from 'vitest';
import { LAYOUT_PRESETS, matchPreset } from '../src/lib/exam/layoutPresets';
import { NEW_EXAM_PRINT, printSettingsOf, printsNameLine } from '../src/lib/exam/printLayout';
import { sheetSketchOf } from '../src/lib/exam/sheetSketch';
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

describe('sheet sketch (issue #272)', () => {
  it('draws the scan aids and stickers of digital grading', () => {
    const model = sheetSketchOf({ ...NEW_EXAM_PRINT }, false);
    expect(model).toMatchObject({ scanAids: true, pageCodes: true, qr: 'sticker', initials: true, nameLine: false, layout: 'duplex', sheets: 2 });
    expect(model.pages.map((p) => p.role)).toEqual(['cover', 'exercises', 'exercises', 'writing']);
    expect(model.pages.filter((p) => p.stickerSpot).map((p) => p.number)).toEqual([3]);
    expect(model.pages.map((p) => p.cutSide)).toEqual(['right', 'left', 'right', 'left']);
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

  it('a booklet shows two folded A3 sheets with the fold strip', () => {
    const model = sheetSketchOf({ ...NEW_EXAM_PRINT, printLayout: 'booklet', stickerSpots: 'a3' }, false);
    expect(model.pages).toHaveLength(8);
    expect(model.sheets).toBe(2);
    expect(model.pages[0]!.foldSide).toBe('left');
  });
});
