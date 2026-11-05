/** Multi-sheet print settings of an exam (issue #220, docs/dev/multi_sheet_exams.md): page codes and filler pages (Layout tab), print mode, duplex or booklet and sticker spots (Print step). Each works on its own. */

import type { ExamRecord } from '#lib/db/schema';

export type PrintLayout = 'duplex' | 'booklet';
export type PaddingPages = 'none' | 'blank' | 'workspace';
/** Where stickers go in sticker mode: the cover only, every sheet front (duplex), every A3 sheet or every cut A4 leaf (booklet). */
export type StickerSpots = 'cover' | 'sheet' | 'a3' | 'leaf';
export type PrintMode = 'stickers' | 'copies';

export interface PrintSettings {
  pageCodes: boolean;
  padding: PaddingPages;
  layout: PrintLayout;
  mode: PrintMode;
  stickerSpots: StickerSpots;
}

type PrintFields = Pick<ExamRecord, 'pageCodes' | 'paddingPages' | 'printLayout' | 'printMode' | 'stickerSpots'>;

/** What a new exam starts with; older exams read as no page codes, no filler pages and a cover sticker. */
export const NEW_EXAM_PRINT = { pageCodes: true, paddingPages: 'workspace', printLayout: 'duplex', printMode: 'stickers', stickerSpots: 'sheet' } as const satisfies PrintFields;

const SPOTS: ReadonlySet<string> = new Set<StickerSpots>(['cover', 'sheet', 'a3', 'leaf']);

export function printSettingsOf(exam: PrintFields): PrintSettings {
  const layout: PrintLayout = exam.printLayout === 'booklet' ? 'booklet' : 'duplex';
  const spots = SPOTS.has(exam.stickerSpots ?? '') ? (exam.stickerSpots as StickerSpots) : 'cover';
  return {
    pageCodes: exam.pageCodes === true,
    padding: exam.paddingPages === 'workspace' || exam.paddingPages === 'blank' ? exam.paddingPages : 'none',
    layout,
    mode: exam.printMode === 'copies' ? 'copies' : 'stickers',
    stickerSpots: spotsFor(layout, spots),
  };
}

/** The spot choices a layout offers; a choice of the other layout falls back to its nearest one. */
export function spotChoices(layout: PrintLayout): StickerSpots[] {
  return layout === 'booklet' ? ['cover', 'a3', 'leaf'] : ['cover', 'sheet'];
}

function spotsFor(layout: PrintLayout, spots: StickerSpots): StickerSpots {
  if (spotChoices(layout).includes(spots)) return spots;
  if (spots === 'cover') return 'cover';
  return layout === 'booklet' ? 'leaf' : 'sheet';
}

/** Pages per printed sheet: 2 for duplex, 4 for a folded A3 booklet sheet. */
export function pagesPerSheet(layout: PrintLayout): number {
  return layout === 'booklet' ? 4 : 2;
}

/** The pages that carry a sticker spot (page 1 always has its QR box); personalised copies need none, every page code names the student. */
export function stickerPagesOf(settings: PrintSettings, pageCount: number): number[] {
  if (settings.mode === 'copies' || settings.stickerSpots === 'cover') return [];
  const pages: number[] = [];
  // Mirrors Schulaufgabe.sty \SA@checkspot: odd pages from 3; for A3 sheets only each sheet's front right page 2s+1 (2p + 2 <= total).
  for (let p = 3; p <= pageCount; p += 2) if (settings.stickerSpots !== 'a3' || 2 * p + 2 <= pageCount) pages.push(p);
  return pages;
}

/** Stickers each student needs: the cover's plus one per spot. */
export function stickersPerCopy(settings: PrintSettings, pageCount: number): number {
  return 1 + stickerPagesOf(settings, pageCount).length;
}
