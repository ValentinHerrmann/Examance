/** Multi-sheet print layout of an exam (issue #220, docs/dev/multi_sheet_exams.md): page codes, duplex or booklet, filler pages, sticker box per sheet. */

import type { ExamRecord } from '#lib/db/schema';

export type PrintLayout = 'duplex' | 'booklet';
export type PaddingPages = 'blank' | 'workspace';

export interface PrintSettings {
  /** A page code on every page; off keeps the pre-#220 layout of older exams. */
  pageCodes: boolean;
  layout: PrintLayout;
  padding: PaddingPages;
  /** A sticker box on the front of every sheet (duplex only; a booklet is one stapled unit). */
  sheetStickers: boolean;
}

/** What a new exam starts with; older exams read as `pageCodes: false` until the teacher switches. */
export const NEW_EXAM_PRINT = { pageCodes: true, printLayout: 'duplex', paddingPages: 'workspace', sheetStickers: true } as const satisfies Partial<ExamRecord>;

export function printSettingsOf(exam: Pick<ExamRecord, 'pageCodes' | 'printLayout' | 'paddingPages' | 'sheetStickers'>): PrintSettings {
  return {
    pageCodes: exam.pageCodes === true,
    layout: exam.printLayout === 'booklet' ? 'booklet' : 'duplex',
    padding: exam.paddingPages === 'workspace' ? 'workspace' : 'blank',
    sheetStickers: exam.sheetStickers === true,
  };
}

/** Pages per printed sheet: 2 for duplex, 4 for a folded A3 booklet sheet. */
export function pagesPerSheet(layout: PrintLayout): number {
  return layout === 'booklet' ? 4 : 2;
}

/** How many sticker boxes one copy of *pageCount* pages has: one per sheet front with sticker boxes on every sheet, else only the cover's. */
export function stickerBoxesPerCopy(settings: PrintSettings, pageCount: number): number {
  if (!settings.pageCodes || !settings.sheetStickers || settings.layout === 'booklet') return 1;
  return Math.max(1, Math.ceil(pageCount / 2));
}
