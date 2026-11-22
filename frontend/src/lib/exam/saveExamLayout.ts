/** Saves layout and print fields of an exam (Layout step, the Print step's booklet offset; issues #220, #272): PATCH on the server, then the sealed local copy. The one save path for these fields. */

import { get } from 'svelte/store';
import { api } from '#lib/api/client';
import { saveExamEncrypted } from '#lib/db/dbEncryption';
import type { ExamRecord } from '#lib/db/schema';
import { isAuthenticated, sessionStore } from '#lib/stores/session';
import { extraNotesToApi } from '#lib/repositories/examRepository';

const API_FIELDS = {
  infoText: 'info_text',
  nameLine: 'name_line',
  mcCorrectionHint: 'mc_correction_hint',
  pageCodes: 'page_codes',
  printLayout: 'print_layout',
  printMode: 'print_mode',
  stickerSpots: 'sticker_spots',
  paperStyle: 'paper_style',
  extraPages: 'extra_pages',
  bookletOffsetMm: 'booklet_offset_mm',
  digitalGrading: 'digital_grading',
  resultsQrBox: 'results_qr_box',
  cutCorner: 'cut_corner',
  foldStrip: 'fold_strip',
  dottedFields: 'dotted_fields',
  extraNotes: 'extra_notes',
} as const satisfies Partial<Record<keyof ExamRecord, string>>;

export type ExamLayoutPatch = Partial<Pick<ExamRecord, keyof typeof API_FIELDS>>;

/** Every setting of the Layout page, and so what a layout template keeps (issue #279); a new page setting joins here. Not the logo (own endpoint) nor the Print step's booklet offset. */
export const LAYOUT_FIELDS = ['infoText', 'nameLine', 'mcCorrectionHint', 'pageCodes', 'digitalGrading', 'resultsQrBox', 'cutCorner', 'foldStrip', 'dottedFields', 'printLayout', 'printMode', 'stickerSpots', 'paperStyle', 'extraPages', 'extraNotes'] as const satisfies readonly (keyof typeof API_FIELDS)[];
export type LayoutField = (typeof LAYOUT_FIELDS)[number];
/** The free-text settings: a template applies them only after asking when they would replace the exam's own text. */
export const LAYOUT_TEXT_FIELDS = ['infoText', 'extraNotes'] as const satisfies readonly LayoutField[];
export type LayoutTextField = (typeof LAYOUT_TEXT_FIELDS)[number];
/** The Layout page's choices besides the free text. */
export type LayoutChoiceField = Exclude<LayoutField, LayoutTextField>;

/** Returns the saved record; throws on a failed save (the caller shows it). */
export async function saveExamLayout(exam: ExamRecord, patch: ExamLayoutPatch): Promise<ExamRecord> {
  if (get(isAuthenticated)) {
    const body: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(patch)) body[API_FIELDS[field as keyof typeof API_FIELDS]] = value;
    if (patch.extraNotes !== undefined) body.extra_notes = extraNotesToApi(patch.extraNotes);
    await api.patch(`/exams/${exam.id}`, body);
  }
  const updated: ExamRecord = { ...exam, ...patch };
  await saveExamEncrypted(updated, get(sessionStore).sessionKey);
  return updated;
}

/** The shown context with the saved exam, or null when the save belongs to another exam (it landed after a switch, issue #293). */
export function withSavedExam<C extends { exam: ExamRecord }>(ctx: C | null, exam: ExamRecord): C | null {
  return ctx?.exam.id === exam.id ? { ...ctx, exam } : null;
}
