/** Content-free sketch of an exam's printed pages (Layout step, issue #272): what each layout option puts on the sheet, mirrored from withExamOptions and Schulaufgabe.sty, never from compiled content. */

import { pagesPerSheet, printSettingsOf, printsNameLine, stickerPagesOf, type PaperStyle, type PrintLayout, type PrintSettings } from '#lib/exam/printLayout';
import type { ExamRecord } from '#lib/db/schema';

/** One element the sketch can highlight while its option is hovered or focused. */
export type SketchPart = 'scanAids' | 'qr' | 'name' | 'logo' | 'info' | 'pageCodes' | 'mcHint' | 'stickers' | 'fold' | 'paper' | 'notes';

export type SketchPageRole = 'cover' | 'exercises' | 'writing';

export interface SketchPageModel {
  number: number;
  role: SketchPageRole;
  /** The guillotine's corner: top right on odd pages, top left on even ones (lib/qr/cutCorner.ts). */
  cutSide: 'right' | 'left';
  /** Booklets: the side along the fold, which carries the tinted strip. */
  foldSide: 'left' | 'right' | null;
  stickerSpot: boolean;
}

export interface SheetSketchModel {
  /** Corner markers, cut corner and cut lines for scanning. */
  scanAids: boolean;
  pageCodes: boolean;
  /** The QR box on page 1: a sticker field, or the printed code of a personalised copy. */
  qr: 'none' | 'sticker' | 'printed';
  /** The initials field inside the sticker box, in case the sticker falls off. */
  initials: boolean;
  nameLine: boolean;
  logo: boolean;
  info: boolean;
  mcHint: boolean;
  paper: PaperStyle;
  layout: PrintLayout;
  pages: SketchPageModel[];
  /** Printed sheets per copy of the sketched pages: duplex A4 sheets or folded A3 sheets. */
  sheets: number;
}

type SketchSource = Pick<ExamRecord, 'nameLine' | 'mcCorrectionHint' | 'pageCodes' | 'printLayout' | 'printMode' | 'stickerSpots' | 'paperStyle' | 'extraPages' | 'bookletOffsetMm' | 'digitalGrading' | 'resultsQrBox' | 'infoText'>;

/** Sketched pages: two duplex sheets, or two folded A3 sheets so that every sticker-spot choice shows. */
function pageCount(layout: PrintLayout): number {
  return pagesPerSheet(layout) * 2;
}

function roleOf(page: number, total: number): SketchPageRole {
  if (page === 1) return 'cover';
  return page === total ? 'writing' : 'exercises';
}

/** The sketch of an exam's current layout fields; *hasLogo* comes from the logo field, which is not part of the record. */
export function sheetSketchOf(exam: SketchSource, hasLogo: boolean): SheetSketchModel {
  const print: PrintSettings = printSettingsOf(exam);
  const digital = print.digitalGrading;
  const total = pageCount(print.layout);
  // Without scan aids no sticker spot is printed (`ohnescan`), whatever is stored.
  const spots = new Set(digital ? stickerPagesOf(print, total) : []);
  const qr = digital ? (print.mode === 'copies' ? 'printed' : 'sticker') : print.resultsQrBox ? 'sticker' : 'none';
  const nameLine = printsNameLine(print, exam.nameLine);
  const pages: SketchPageModel[] = [];
  for (let n = 1; n <= total; n++) {
    const odd = n % 2 === 1;
    pages.push({
      number: n,
      role: roleOf(n, total),
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
    info: !!exam.infoText?.trim(),
    mcHint: exam.mcCorrectionHint === true,
    paper: print.paperStyle,
    layout: print.layout,
    pages,
    sheets: total / pagesPerSheet(print.layout),
  };
}

/** A single page of *model* for a tile's pictogram: the cover, an exercise page, a writing page or the first page with a sticker spot. */
export function pictogramPage(model: SheetSketchModel, role: SketchPageRole | 'sticker'): SketchPageModel {
  const pick = role === 'sticker' ? model.pages.find((p) => p.stickerSpot) : model.pages.find((p) => p.role === role);
  return pick ?? model.pages[0]!;
}
