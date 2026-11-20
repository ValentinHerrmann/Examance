/** Multi-sheet print settings of an exam (issues #220 and #228, docs/dev/multi_sheet_exams.md): all set in the Layout step (issue #272): page codes, extra paper, print mode, duplex or booklet and sticker spots. The printed sheet always fills up to whole sheets of its layout with extra pages. */

import type { ExamRecord } from '#lib/db/schema';
import { parseDecimal } from '#lib/utils/parseDecimal';

export type PrintLayout = 'duplex' | 'booklet';
/** Where stickers go in sticker mode: the cover only, every sheet front (duplex), every A3 sheet or every cut A4 leaf (booklet). */
export type StickerSpots = 'cover' | 'sheet' | 'a3' | 'leaf';
export type PrintMode = 'stickers' | 'copies';
/** Pattern of every writing space (issue #228): the rest of the last page, extra pages (also those filling whole sheets) and the extra-sheet stack. */
export type PaperStyle = 'empty' | 'squared' | 'lined';
/** Most extra pages an exam asks for at least; the print sheet may add more to fill whole sheets. */
export const MAX_EXTRA_PAGES = 20;

export interface PrintSettings {
  pageCodes: boolean;
  layout: PrintLayout;
  mode: PrintMode;
  stickerSpots: StickerSpots;
  paperStyle: PaperStyle;
  /** Extra pages after the points table in every copy, at least, 0..MAX_EXTRA_PAGES. */
  extraPages: number;
  /** Shift of imposed A3 booklet sheets in mm, positive to the right, within ±MAX_BOOKLET_OFFSET (issue #228). */
  bookletOffsetMm: number;
  /** Graded in Examance (scans, OMR); false prints no scan aids (issue #228). */
  digitalGrading: boolean;
  /** Without digital grading: the QR box on page 1 (always for personalised copies). */
  resultsQrBox: boolean;
  /** The tinted cut-off corner with cut line and scissors on every page (issue #272); always for personalised copies, whose name sits there. */
  cutCorner: boolean;
  /** A booklet's fold strip (issue #272). */
  foldStrip: boolean;
}

type PrintFields = Pick<ExamRecord, 'pageCodes' | 'printLayout' | 'printMode' | 'stickerSpots' | 'paperStyle' | 'extraPages' | 'bookletOffsetMm' | 'digitalGrading' | 'resultsQrBox' | 'cutCorner' | 'foldStrip'>;

/** What a new exam starts with; older exams read as no page codes, a cover sticker and empty writing paper. */
export const NEW_EXAM_PRINT = { pageCodes: true, printLayout: 'duplex', printMode: 'stickers', stickerSpots: 'sheet', paperStyle: 'squared', extraPages: 0, bookletOffsetMm: 0, digitalGrading: true, resultsQrBox: false, cutCorner: true, foldStrip: true } as const satisfies PrintFields;

const SPOTS: ReadonlySet<string> = new Set<StickerSpots>(['cover', 'sheet', 'a3', 'leaf']);
const PAPER: ReadonlySet<string> = new Set<PaperStyle>(['empty', 'squared', 'lined']);

/** Largest booklet shift either way, in mm; a printer further off needs its own adjustment. */
export const MAX_BOOKLET_OFFSET = 10;

/** A typed ("2,5") or stored number; anything else is NaN. */
function numberOf(value: unknown): number {
  if (typeof value === 'number') return value;
  return typeof value === 'string' ? (parseDecimal(value) ?? Number.NaN) : Number.NaN;
}

/** A stored or typed shift as a multiple of 0.5 mm within ±MAX_BOOKLET_OFFSET. */
export function clampBookletOffset(value: unknown): number {
  const n = Math.round(numberOf(value) * 2) / 2;
  return Number.isFinite(n) ? Math.min(MAX_BOOKLET_OFFSET, Math.max(-MAX_BOOKLET_OFFSET, n)) + 0 : 0;
}

/** A stored or typed page count as a whole number within 0..MAX_EXTRA_PAGES. */
export function clampExtraPages(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(MAX_EXTRA_PAGES, Math.max(0, n)) : 0;
}

export function printSettingsOf(exam: PrintFields): PrintSettings {
  const layout: PrintLayout = exam.printLayout === 'booklet' ? 'booklet' : 'duplex';
  // A paper exam without QR box hands out no stickers, so it has no further sticker spots either (issue #272).
  const noStickers = exam.digitalGrading === false && exam.resultsQrBox !== true;
  const spots = !noStickers && SPOTS.has(exam.stickerSpots ?? '') ? (exam.stickerSpots as StickerSpots) : 'cover';
  return {
    pageCodes: exam.pageCodes === true,
    layout,
    // Personalised copies also work without Examance grading (anonymous papers graded by hand, issue #272).
    mode: exam.printMode === 'copies' ? 'copies' : 'stickers',
    stickerSpots: spotsFor(layout, spots),
    paperStyle: PAPER.has(exam.paperStyle ?? '') ? (exam.paperStyle as PaperStyle) : 'empty',
    extraPages: clampExtraPages(exam.extraPages),
    bookletOffsetMm: clampBookletOffset(exam.bookletOffsetMm),
    digitalGrading: exam.digitalGrading !== false,
    // Without scan aids the QR box is optional, except for personalised copies, which stamp their code into it.
    resultsQrBox: exam.digitalGrading === false && (exam.resultsQrBox === true || exam.printMode === 'copies'),
    // Absent (records from before the switches) prints as before: with Examance grading only.
    cutCorner: exam.printMode === 'copies' || (exam.cutCorner ?? exam.digitalGrading !== false),
    foldStrip: exam.foldStrip ?? exam.digitalGrading !== false,
  };
}

/** Whether page 1 prints a name line: always when asked, and on a paper-graded exam without a QR box, which would otherwise name nobody (issue #272). */
export function printsNameLine(settings: Pick<PrintSettings, 'digitalGrading' | 'resultsQrBox'>, nameLine: boolean | undefined): boolean {
  return nameLine === true || (!settings.digitalGrading && !settings.resultsQrBox);
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

/** What shapes a made print file besides content and students: a file made under another key is outdated (Print step). */
export function printFileKey(job: 'exam' | 'qr' | 'copies' | 'copiesA3' | 'extra', booklet: 'impose' | 'printer' | null, stickers: number, paper: PaperStyle = 'empty', offsetMm = 0): string {
  if (job === 'qr') return `qr:${stickers}`;
  if (job === 'extra') return `extra:${paper}`;
  // Large-print copies are always loose A3 sheets, whatever the rest is printed as.
  if (job === 'copiesA3') return 'copiesA3';
  // Imposed sheets carry the shift, so a new offset makes them again.
  return booklet === 'impose' ? `${job}:impose:${offsetMm}` : `${job}:${booklet ?? 'a4'}`;
}
