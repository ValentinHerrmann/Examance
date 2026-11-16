/** The Layout step's preview model (issue #272): which pages a copy has and what each option puts on them, mirrored from withExamOptions and Schulaufgabe.sty; the sample exam (`layoutSample.ts`) supplies the content pages. */

import { pagesPerSheet, printSettingsOf, printsNameLine, stickerPagesOf, type PaperStyle, type PrintLayout, type PrintSettings } from '#lib/exam/printLayout';
import { DEFAULT_EXTRA_NOTES, fillsLastPage, type ExamRecord } from '#lib/db/schema';

/** One element the preview can highlight while its option is hovered or focused; `cornerTab` is the personalised copy's name and key on page 1's cut-off corner, `cutCorner` the tinted corner with its cut line. */
export type SketchPart = 'markers' | 'cutCorner' | 'cornerTab' | 'qr' | 'name' | 'logo' | 'info' | 'pageCodes' | 'mcHint' | 'stickers' | 'fold' | 'paper' | 'notes';

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
  /** The four corner markers the scanner registers by (printed with Examance grading). */
  markers: boolean;
  /** The tinted cut-off corner with its cut line, on every page. */
  cutCorner: boolean;
  pageCodes: boolean;
  /** The QR box on page 1: a sticker field, the printed code of a personalised copy, or none. */
  qr: 'none' | 'sticker' | 'printed';
  /** The initials field inside the sticker box, in case the sticker falls off. */
  initials: boolean;
  nameLine: boolean;
  logo: boolean;
  /** The exam's info text as plain lines (`infoTextLines`). */
  infoLines: string[];
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

type SketchSource = Pick<ExamRecord, 'nameLine' | 'mcCorrectionHint' | 'pageCodes' | 'printLayout' | 'printMode' | 'stickerSpots' | 'paperStyle' | 'extraPages' | 'bookletOffsetMm' | 'digitalGrading' | 'resultsQrBox' | 'cutCorner' | 'foldStrip' | 'extraNotes' | 'infoText'>;

/** The sample's content pages when it is not compiled yet. */
export const SAMPLE_PAGES = 3;

/** Content pages first, then the requested extra pages, then the filler pages up to whole sheets. */
function roleOf(page: number, content: number, beforeFiller: number): SketchPageRole {
  if (page === 1) return 'cover';
  if (page < content) return 'exercises';
  if (page === content) return 'last';
  return page <= beforeFiller ? 'extra' : 'filler';
}

/** Personalised copies print the code with or without Examance grading (issue #272); otherwise the sticker box is printed for scanning or when asked. */
function qrOf(print: PrintSettings): SheetSketchModel['qr'] {
  if (print.mode === 'copies') return 'printed';
  return print.digitalGrading || print.resultsQrBox ? 'sticker' : 'none';
}

/** One page's place on the sheet: the cut corner alternates with the page side, a booklet's fold is on the inner side. */
function pageOf(n: number, role: SketchPageRole, booklet: boolean, spot: boolean): SketchPageModel {
  const odd = n % 2 === 1;
  let foldSide: SketchPageModel['foldSide'] = null;
  if (booklet) foldSide = odd ? 'left' : 'right';
  return { number: n, role, cutSide: odd ? 'right' : 'left', foldSide, stickerSpot: spot };
}

/** The pages of a copy: *contentPages* from the sample, the exam's extra pages, then filler pages up to whole sheets of its layout. */
export function sheetSketchOf(exam: SketchSource, hasLogo: boolean, contentPages = SAMPLE_PAGES): SheetSketchModel {
  const print: PrintSettings = printSettingsOf(exam);
  const digital = print.digitalGrading;
  const per = pagesPerSheet(print.layout);
  const before = contentPages + print.extraPages;
  const total = Math.ceil(before / per) * per;
  const spots = new Set(stickerPagesOf(print, total));
  const qr = qrOf(print);
  const nameLine = printsNameLine(print, exam.nameLine);
  const notes = exam.extraNotes ?? DEFAULT_EXTRA_NOTES;
  // Without its strip a booklet still folds, but nothing is printed there.
  const foldStrip = print.layout === 'booklet' && print.foldStrip;
  const pages = Array.from({ length: total }, (_, i) => pageOf(i + 1, roleOf(i + 1, contentPages, before), foldStrip, spots.has(i + 1)));
  return {
    markers: digital,
    cutCorner: print.cutCorner,
    pageCodes: print.pageCodes,
    qr,
    initials: qr === 'sticker' && !nameLine,
    nameLine,
    logo: hasLogo,
    infoLines: infoTextLines(exam.infoText ?? ''),
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
    case 'markers':
    case 'cutCorner':
    case 'mcHint':
      return first((p) => p.role === 'exercises') ?? 1;
    case 'cornerTab':
    default:
      return 1;
  }
}

/** Where a copy names its student: the sticker (cover, later sticker spots), the cut-off corner of a personalised copy, the handwritten name line. */
export type NamePlace = 'sticker' | 'stickerSpots' | 'cornerTab' | 'nameLine';

/** Where the name is printed or written, and whether it is still on the paper that is graded (a personalised copy's corner is cut off first; a sticker and a name line stay). */
export function nameInfoOf(model: SheetSketchModel): { places: NamePlace[]; visibleOnGraded: boolean } {
  const places: NamePlace[] = [];
  if (model.qr === 'sticker') places.push('sticker');
  if (model.pages.some((p) => p.stickerSpot)) places.push('stickerSpots');
  if (model.qr === 'printed') places.push('cornerTab');
  if (model.nameLine) places.push('nameLine');
  return { places, visibleOnGraded: model.nameLine || model.qr === 'sticker' };
}

/** The elements on *page*, in reading order, for the preview's callouts and its "on this page" list; *hasMc* says whether the page holds the sample's MC question. */
export function pageElementsOf(model: SheetSketchModel, page: SketchPageModel, hasMc = page.role === 'exercises'): SketchPart[] {
  const cover = page.role === 'cover';
  const writing = page.role === 'extra' || page.role === 'filler' || (page.role === 'last' && model.restArea);
  const present: [SketchPart, boolean][] = [
    ['logo', cover && model.logo],
    ['cornerTab', cover && model.qr === 'printed'],
    ['info', cover && model.infoLines.length > 0],
    ['markers', model.markers],
    ['cutCorner', model.cutCorner && !(cover && model.qr === 'printed')],
    ['pageCodes', model.pageCodes],
    ['stickers', page.stickerSpot],
    ['qr', cover && model.qr !== 'none'],
    ['name', cover && model.nameLine],
    ['mcHint', hasMc && model.mcHint],
    ['fold', page.foldSide !== null],
    ['notes', writing],
    ['paper', writing],
  ];
  return present.filter(([, on]) => on).map(([part]) => part);
}

/** Pages grouped as printed: front and back of each A4 sheet, or the four pages of each folded A3 sheet. */
export function sheetsOf(model: SheetSketchModel): SketchPageModel[][] {
  const per = pagesPerSheet(model.layout);
  const out: SketchPageModel[][] = [];
  for (let i = 0; i < model.pages.length; i += per) out.push(model.pages.slice(i, i + per));
  return out;
}

/** The info text as the preview prints it: one line per paragraph or `\item` (a bullet), commands and braces dropped; an approximation, the PDF shows the real one. */
export function infoTextLines(tex: string): string[] {
  const text = tex
    .replace(/(?<!\\)%.*$/gm, '')
    .replace(/\\item\b\s*/g, '\n• ')
    .replace(/\\(?:begin|end)\{[^}]*\}/g, '\n')
    .replace(/\\\\/g, '\n')
    .replace(/\\[a-zA-Z@]+\*?(?:\[[^\]]*\])?/g, '')
    .replace(/\\(.)/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/~/g, ' ');
  return text
    .split(/\n\s*\n|\n(?=• )|\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line && line !== '•');
}
