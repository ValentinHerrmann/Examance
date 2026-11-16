/** Layout presets of the Layout step (issue #272): starting points that set the fields shaping the sheet; never stored, the page shows the one the current fields match. */

import type { ExamRecord } from '#lib/db/schema';
import { printSettingsOf } from '#lib/exam/printLayout';
import type { ExamLayoutPatch } from '#lib/exam/saveExamLayout';

export type LayoutPresetId = 'fullDigital' | 'digitalBooklet' | 'anonymousPaper' | 'namedPaper';

/** The fields a preset sets; paper, extra pages, notes, logo and info text are content choices and stay as they are. */
export type PresetFields = Required<Pick<ExamLayoutPatch, 'digitalGrading' | 'resultsQrBox' | 'nameLine' | 'pageCodes' | 'mcCorrectionHint' | 'printLayout' | 'printMode' | 'stickerSpots'>>;

const DIGITAL: PresetFields = { digitalGrading: true, resultsQrBox: false, nameLine: false, pageCodes: true, mcCorrectionHint: true, printLayout: 'duplex', printMode: 'stickers', stickerSpots: 'sheet' };
const PAPER = { digitalGrading: true, pageCodes: true, mcCorrectionHint: true, printLayout: 'duplex', printMode: 'stickers', stickerSpots: 'sheet' } as const;

export const LAYOUT_PRESETS: readonly { id: LayoutPresetId; fields: PresetFields }[] = [
  { id: 'fullDigital', fields: DIGITAL },
  { id: 'digitalBooklet', fields: { ...DIGITAL, printLayout: 'booklet', stickerSpots: 'a3' } },
  // Paper grading keeps page codes and sticker spots stored as for digital grading, so switching grading back on restores them.
  { id: 'anonymousPaper', fields: { ...PAPER, digitalGrading: false, resultsQrBox: true, nameLine: false } },
  { id: 'namedPaper', fields: { ...PAPER, digitalGrading: false, resultsQrBox: false, nameLine: true } },
];

type PresetSource = Pick<ExamRecord, 'nameLine' | 'mcCorrectionHint' | 'pageCodes' | 'printLayout' | 'printMode' | 'stickerSpots' | 'paperStyle' | 'extraPages' | 'bookletOffsetMm' | 'digitalGrading' | 'resultsQrBox'>;

/** The fields as they print: paper grading ignores page codes, sticker spots and copies, so those do not decide the match there. */
function printedForm(fields: PresetSource) {
  const print = printSettingsOf(fields);
  const digital = print.digitalGrading;
  return {
    digitalGrading: digital,
    resultsQrBox: print.resultsQrBox,
    nameLine: fields.nameLine === true,
    mcCorrectionHint: fields.mcCorrectionHint === true,
    layout: print.layout,
    pageCodes: digital && print.pageCodes,
    mode: digital ? print.mode : 'stickers',
    stickerSpots: digital ? print.stickerSpots : 'cover',
  };
}

/** The preset the fields match as printed, or 'custom'. */
export function matchPreset(fields: PresetSource): LayoutPresetId | 'custom' {
  const current = JSON.stringify(printedForm(fields));
  const hit = LAYOUT_PRESETS.find((p) => JSON.stringify(printedForm({ ...fields, ...p.fields })) === current);
  return hit?.id ?? 'custom';
}
