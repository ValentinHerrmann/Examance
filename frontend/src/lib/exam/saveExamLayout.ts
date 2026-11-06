/** Saves layout and print fields of an exam (Layout tab, Print step; issue #220): PATCH on the server, then the sealed local copy. The one save path for these fields. */

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
  latexPackages: 'latex_packages',
  pageCodes: 'page_codes',
  paddingPages: 'padding_pages',
  printLayout: 'print_layout',
  printMode: 'print_mode',
  stickerSpots: 'sticker_spots',
  paperStyle: 'paper_style',
  extraPages: 'extra_pages',
  extraSheets: 'extra_sheets',
  extraNotes: 'extra_notes',
} as const satisfies Partial<Record<keyof ExamRecord, string>>;

export type ExamLayoutPatch = Partial<Pick<ExamRecord, keyof typeof API_FIELDS>>;

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
