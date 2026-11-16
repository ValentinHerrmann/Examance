/** The Layout step's preview model (issue #272): which pages a copy has and what each option puts on them, mirrored from withExamOptions and Schulaufgabe.sty; the sample exam (`layoutSample.ts`) supplies the content pages. */

import { pagesPerSheet, printSettingsOf, printsNameLine, stickerPagesOf, type PaperStyle, type PrintLayout, type PrintSettings } from '#lib/exam/printLayout';
import { DEFAULT_EXTRA_NOTES, fillsLastPage, type ExamRecord } from '#lib/db/schema';

/** One element the preview can highlight while its option is hovered or focused. */
export type SketchPart = 'scanAids' | 'qr' | 'name' | 'logo' | 'info' | 'pageCodes' | 'mcHint' | 'stickers' | 'fold' | 'paper' | 'notes';

/** Content pages come from the sample; `extra` are the exam's extra pages, `filler` the ones that fill whole sheets. */
export type SketchPageRole = 'cover' | 'exercises' | 'last' | 'extra' | 'filler';

export interface SketchPageModel {
  number: number;
  role: SketchPageRole;
  /** The guillotine's corner: top right on odd pages, top left on even ones (lib/qr/cutCorner.ts). */
  cutSide: 'right' | 'left';
  /** Booklets: the side along the fold, which carries the cut strip. */
  foldSide: 'left' | 'right' | null;
  stickerSpot: boolean;
}

export interface SheetSketchModel {
  /** Corner markers, cut corner and cut lines for scanning. */
  scanAids: boolean;
  pageCodes: boolean;
  /** The QR box on page 1: a sticker field, the printed code of a personalised copy, or none. */
  qr: 'none' | 'sticker' | 'printed';
  /** The initials field inside the sticker box, in case the sticker falls off. */
  initials: boolean;
  nameLine: boolean;
  logo: boolean;
  mcHint: boolean;
  paper: PaperStyle;
  /** The last page's rest-of-page writing area (`\ExamNotes`). */
  restArea: boolean;
  notesTitle: string;
  notesNote: string;
  layout: PrintLayout;
  pages: SketchPageModel[];
  /** Printed sheets per copy: duplex A4 sheets or folded A3 sheets. */
  sheets: number;
}

type SketchSource = Pick<ExamRecord, 'nameLine' | 'mcCorrectionHint' | 'pageCodes' | 'printLayout' | 'printMode' | 'stickerSpots' | 'paperStyle' | 'extraPages' | 'bookletOffsetMm' | 'digitalGrading' | 'resultsQrBox' | 'extraNotes'>;

/** The sample's content pages when it is not compiled yet. */
export const SAMPLE_PAGES = 3;

function contentRole(page: number, content: number): SketchPageRole {
  if (page === 1) return 'cover';
  return page === content ? 'last' : 'exercises';
}

/** The pages of a copy: *contentPages* from the sample, the exam's extra pages, then filler pages up to whole sheets of its layout. */
export function sheetSketchOf(exam: SketchSource, hasLogo: boolean, contentPages = SAMPLE_PAGES): SheetSketchModel {
  const print: PrintSettings = printSettingsOf(exam);
  const digital = print.digitalGrading;
  const per = pagesPerSheet(print.layout);
  const before = contentPages + print.extraPages;
  const total = Math.ceil(before / per) * per;
  // Without scan aids no sticker spot is printed (`ohnescan`), whatever is stored.
  const spots = new Set(digital ? stickerPagesOf(print, total) : []);
  const qr = digital ? (print.mode === 'copies' ? 'printed' : 'sticker') : print.resultsQrBox ? 'sticker' : 'none';
  const nameLine = printsNameLine(print, exam.nameLine);
  const notes = exam.extraNotes ?? DEFAULT_EXTRA_NOTES;
  const pages: SketchPageModel[] = [];
  for (let n = 1; n <= total; n++) {
    const odd = n % 2 === 1;
    pages.push({
      number: n,
      role: n <= contentPages ? contentRole(n, contentPages) : n <= before ? 'extra' : 'filler',
      cutSide: odd ? 'right' : 'left',
      foldSide: print.layout === 'booklet' && digital ? (odd ? 'left' : 'right') : null,
      stickerSpot: spots.has(n),
    });
  }
  return {
    scanAids: digital,
    pageCodes: digital && print.pageCodes,
    qr,
    initials: qr === 'sticker' && !nameLine,
    nameLine,
    logo: hasLogo,
    mcHint: exam.mcCorrectionHint === true,
    paper: print.paperStyle,
    restArea: fillsLastPage(notes),
    notesTitle: notes.title,
    notesNote: notes.description ?? '',
    layout: print.layout,
    pages,
    sheets: total / per,
  };
}

/** The page that shows *part* best: the cover for its elements, an exercise page for every-page marks, the first sticker or writing page. */
export function focusPageOf(part: SketchPart, model: SheetSketchModel): number {
  const first = (test: (p: SketchPageModel) => boolean) => model.pages.find(test)?.number;
  switch (part) {
    case 'stickers':
      return first((p) => p.stickerSpot) ?? 3;
    case 'paper':
    case 'notes':
      return first((p) => p.role === 'extra' || p.role === 'filler') ?? first((p) => p.role === 'last') ?? 1;
    case 'pageCodes':
    case 'scanAids':
    case 'mcHint':
      return first((p) => p.role === 'exercises') ?? 1;
    default:
      return 1;
  }
}

/** Pages grouped as printed: front and back of each A4 sheet, or the four pages of each folded A3 sheet. */
export function sheetsOf(model: SheetSketchModel): SketchPageModel[][] {
  const per = pagesPerSheet(model.layout);
  const out: SketchPageModel[][] = [];
  for (let i = 0; i < model.pages.length; i += per) out.push(model.pages.slice(i, i + per));
  return out;
}
