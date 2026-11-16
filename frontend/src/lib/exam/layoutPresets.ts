/** Layout presets of the Layout step (issue #272): starting points that set the fields shaping the sheet; never stored, the page shows the one the current fields match. Four presets that together show every major choice at least once in each pairing: grading × print form × QR code × name. */

import type { ExamRecord } from '#lib/db/schema';
import { printSettingsOf } from '#lib/exam/printLayout';
import type { ExamLayoutPatch } from '#lib/exam/saveExamLayout';

export type LayoutPresetId = 'fullDigital' | 'digitalCopiesBooklet' | 'anonymousPaperCopies' | 'namedPaperBooklet';

/** The fields a preset sets; paper, extra pages, notes, logo and info text are content choices and stay as they are. */
export type PresetFields = Required<Pick<ExamLayoutPatch, 'digitalGrading' | 'resultsQrBox' | 'cutCorner' | 'foldStrip' | 'nameLine' | 'pageCodes' | 'mcCorrectionHint' | 'printLayout' | 'printMode' | 'stickerSpots'>>;

const DIGITAL: PresetFields = { digitalGrading: true, resultsQrBox: false, cutCorner: true, foldStrip: true, nameLine: false, pageCodes: true, mcCorrectionHint: true, printLayout: 'duplex', printMode: 'stickers', stickerSpots: 'sheet' };
const PAPER: PresetFields = { digitalGrading: false, resultsQrBox: false, cutCorner: false, foldStrip: false, nameLine: true, pageCodes: false, mcCorrectionHint: true, printLayout: 'duplex', printMode: 'stickers', stickerSpots: 'cover' };

export const LAYOUT_PRESETS: readonly { id: LayoutPresetId; fields: PresetFields }[] = [
  // Scans and anonymous grading in Examance: identical copies, QR stickers on every sheet.
  { id: 'fullDigital', fields: DIGITAL },
  // Scanned A3 booklets with the QR code printed on each copy and the name written on it too.
  { id: 'digitalCopiesBooklet', fields: { ...DIGITAL, printLayout: 'booklet', printMode: 'copies', stickerSpots: 'cover', nameLine: true } },
  // Graded by hand but anonymously: the code is printed, name and key sit on the corner that is cut off before grading.
  { id: 'anonymousPaperCopies', fields: { ...PAPER, resultsQrBox: true, cutCorner: true, nameLine: false, printMode: 'copies' } },
  // Classic paper exam as an A3 booklet: no scan aids, no QR code, the students write their names.
  { id: 'namedPaperBooklet', fields: { ...PAPER, printLayout: 'booklet' } },
];

type PresetSource = Pick<ExamRecord, 'nameLine' | 'mcCorrectionHint' | 'pageCodes' | 'printLayout' | 'printMode' | 'stickerSpots' | 'paperStyle' | 'extraPages' | 'bookletOffsetMm' | 'digitalGrading' | 'resultsQrBox' | 'cutCorner' | 'foldStrip'>;

/** The fields as they print: sticker spots only matter with stickers, the fold strip only in a booklet. */
function printedForm(fields: PresetSource) {
  const print = printSettingsOf(fields);
  return {
    digitalGrading: print.digitalGrading,
    resultsQrBox: print.resultsQrBox,
    cutCorner: print.cutCorner,
    foldStrip: print.layout === 'booklet' && print.foldStrip,
    nameLine: fields.nameLine === true,
    mcCorrectionHint: fields.mcCorrectionHint === true,
    layout: print.layout,
    pageCodes: print.pageCodes,
    mode: print.mode,
    stickerSpots: print.mode === 'stickers' ? print.stickerSpots : 'cover',
  };
}

/** The preset the fields match as printed, or 'custom'. */
export function matchPreset(fields: PresetSource): LayoutPresetId | 'custom' {
  const current = JSON.stringify(printedForm(fields));
  const hit = LAYOUT_PRESETS.find((p) => JSON.stringify(printedForm({ ...fields, ...p.fields })) === current);
  return hit?.id ?? 'custom';
}
