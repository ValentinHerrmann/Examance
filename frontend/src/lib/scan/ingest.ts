/** Scan ingest: uploaded PDFs -> QR decode (+ OMR) per page -> one encrypted booklet per student. No UI here (no dialogs, no component state): the scan page renders `onProgress` and the result. Multi-sheet exams (issue #220, docs/dev/multi_sheet_exams.md): page codes order each booklet, A3 booklet sheets are split, missing pages get placeholders; no scanned page is ever dropped. */
import type { PageViewport, PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { PDFDocument } from "pdf-lib";
import { loadPdfjs } from "#lib/pdf/pdfjs";
import { saveStudentEncrypted, saveSubmissionEncrypted, sealScan } from "#lib/db/dbEncryption";
import { pseudonymFor } from "#lib/services/pseudonymRekey";
import { joinKey, joinKeys } from "#lib/crypto/pseudonymKey";
import { studentRepository } from "#lib/repositories/studentRepository";
import type { ExerciseScoreRecord, OmrPageTemplate, StudentRecord, SubmissionRecord } from "#lib/db/schema";
import { buildOmrScoreRecord } from "#lib/grading/omrResult";
import { createOmrRun, type OmrPageStats, type OmrRunInfo, type OmrSettingsProfile } from "#lib/grading/omrSettings";
import { scoreRepository } from "#lib/repositories/scoreRepository";
import { parseStudentQr, stickerRawOf } from "#lib/utils/studentQr";
import { randomCode } from "#lib/utils/randomCode";
import type { QrWorkerRequest, QrWorkerResponse } from "#lib/workers/qrWorker";
import { qrResultOf, type QrResult } from "#lib/scan/qrText";
import { examTag, parsePageCode } from "#lib/exam/pageCodes";
import { submissionRepository } from "#lib/repositories/submissionRepository";
import { openScan } from "#lib/db/dbEncryption";
import { addPlaceholderPage, attachOriginals, carryAttachments, halfImage, isA3Landscape, placeholderOf, splitA3 } from "#lib/scan/scanPdf";
import type {
  OmrExerciseAnswerKey,
  OmrExerciseResult,
  OmrWorkerRequest,
  OmrWorkerResponse,
} from "#lib/workers/omrWorker";

export interface PdfPageRef {
  doc: PDFDocument;
  index: number;
  /** Printed page number from the page's code (multi-sheet exams); absent on pages without a readable code. */
  page?: number;
  /** The unsplit A3 page this half came from, kept with the scan (issue #220). */
  original?: { doc: PDFDocument; index: number };
}

export interface StudentBooklet {
  pseudonymId: string;
  fallbackCode: string;
  studentName?: string;
  studentNumber?: string;
  isUnmatched: boolean;
  pageRefs: PdfPageRef[];
}

export type { QrResult };
type OmrResponse = Extract<OmrWorkerResponse, { type: "OMR_RESULT" }>;

/** Index = corner number in `OmrWorkerResponse.fiducialCorners`. */
const CORNER_NAMES = ["bottom-left", "bottom-right", "top-right", "top-left"];

export type IngestProgress =
  | { phase: "analyzing"; progress: number }
  | { phase: "scanning"; progress: number; current: number; total: number; fileName: string }
  | { phase: "saving"; progress: number; current: number; total: number; pages: number };

/** Problems that skip a file or page without failing the upload (also logged to the console). */
export type IngestWarning =
  | { kind: "pdfUnreadable"; fileName: string; error: unknown }
  | { kind: "unsupportedFile"; fileName: string }
  | { kind: "omrFailed"; fileName: string; error: unknown }
  /** A page code of another exam: the page went to its own unmatched booklet. */
  | { kind: "foreignPage"; fileName: string }
  /** A personalised page code whose sticker ID no student of the exam has: the page went to an unmatched booklet named by the ID. */
  | { kind: "unknownId"; fileName: string; id: string }
  /** A student's scan lacks printed pages: placeholders stand in until they are scanned. */
  | { kind: "missingPages"; student: string; pages: number[] }
  /** Pages scanned twice or without a readable page code: kept after the exam's pages. */
  | { kind: "extraPages"; student: string; count: number };

export interface OmrSummary {
  alignmentFailures: number;
  /** Fewest fiducials found on any OMR page; null if no page was processed. */
  minFiducialsFound: number | null;
  missingCorners: string[];
}

export interface IngestResult {
  fileCount: number;
  pageCount: number;
  bookletCount: number;
  warnings: IngestWarning[];
  omr: OmrSummary;
}

export interface OmrContext {
  templatePages: OmrPageTemplate[];
  answerKeys: OmrExerciseAnswerKey[];
}

interface Dispatcher<Req, Res> {
  dispatch(request: Req): Promise<Res>;
}

export interface IngestDeps {
  examId: string;
  /** Read at each use, never cached: the key can change while a long upload runs. */
  getSessionKey: () => CryptoKey | null;
  qrPool: Dispatcher<QrWorkerRequest, QrWorkerResponse> | null;
  omrPool: Dispatcher<OmrWorkerRequest, OmrWorkerResponse> | null;
  /** Read per page: null while the exam has no usable OMR template (it may finish loading mid-upload). */
  getOmrContext: () => OmrContext | null;
  /** Snapshotted once into the run stamped on every score row (issue #32). */
  omrSettings: OmrSettingsProfile;
  omrTemplateHash?: string;
  monitor?: { checkMemoryHealth(): void };
  onProgress?: (progress: IngestProgress) => void;
  /** The exam prints page codes: a page whose code the full-page pass missed gets a closer look at the code's spot (issue #220). */
  pageCodes?: boolean;
}

export function isPdfFile(file: Pick<File, "name" | "type">): boolean {
  return file.type === "application/pdf" || file.name.endsWith(".pdf");
}

/** Groups scanned pages into per-student booklets, in scan order. */
export class BookletCollector {
  readonly booklets: StudentBooklet[] = [];
  private current: StudentBooklet | null = null;

  /** A QR page joins the booklet of its pseudonym (current one first, then any earlier one) or opens a new one. A page without QR continues the current booklet, or opens an unmatched one if there is none yet. A page of another exam (`foreign`) opens its own unmatched booklet; a page code with an ID nobody has joins the unmatched booklet of that ID. */
  addPage(qr: QrResult | null, pageRef: PdfPageRef, opts: { foreign?: boolean; unknownId?: string } = {}): StudentBooklet {
    if (opts.foreign) {
      this.current = this.openUnmatched();
    } else if (opts.unknownId) {
      const code = `ID-${opts.unknownId}`;
      this.current = this.booklets.find((b) => b.isUnmatched && b.fallbackCode === code) ?? this.openUnmatched(code);
    } else if (qr) {
      if (this.current?.pseudonymId !== qr.pseudonymId) {
        this.current = this.booklets.find((b) => b.pseudonymId === qr.pseudonymId) ?? this.open(bookletFromQr(qr));
      }
    } else {
      this.current ??= this.openUnmatched();
    }
    this.current.pageRefs.push(pageRef);
    return this.current;
  }

  private openUnmatched(fallbackCode = `UNMATCHED-${randomCode()}`): StudentBooklet {
    return this.open({ pseudonymId: crypto.randomUUID(), fallbackCode, isUnmatched: true, pageRefs: [] });
  }

  private open(booklet: StudentBooklet): StudentBooklet {
    this.booklets.push(booklet);
    return booklet;
  }
}

function bookletFromQr(qr: QrResult): StudentBooklet {
  const parsed = parseStudentQr(qr.pseudonymId) || (qr.rawText ? parseStudentQr(qr.rawText) : null);
  return {
    pseudonymId: qr.pseudonymId,
    fallbackCode: (parsed ? parsed.displayName : null) || qr.fallbackCode || `F-${randomCode()}`,
    studentName: parsed?.displayName,
    studentNumber: parsed?.studentNumber,
    isUnmatched: false,
    pageRefs: [],
  };
}

/** Collects OMR results per booklet across its pages, plus the alignment diagnostics of the whole upload. */
export class OmrAccumulator {
  private readonly byPseudonym = new Map<string, { result: OmrExerciseResult; pageStats: OmrPageStats }[]>();
  private alignmentFailures = 0;
  private minFiducialsFound: number | null = null;
  private readonly missingCorners = new Set<string>();

  add(pseudonymId: string, res: OmrResponse): void {
    const list = this.byPseudonym.get(pseudonymId) ?? [];
    list.push(...res.results.map((result) => ({ result, pageStats: res.pageStats })));
    this.byPseudonym.set(pseudonymId, list);
    if (res.alignmentFailed) this.alignmentFailures++;
    this.minFiducialsFound =
      this.minFiducialsFound === null ? res.fiducialsFound : Math.min(this.minFiducialsFound, res.fiducialsFound);
    if (res.fiducialCorners) {
      for (let c = 0; c < 4; c++) {
        if (!res.fiducialCorners.includes(c)) this.missingCorners.add(CORNER_NAMES[c]);
      }
    }
  }

  resultsFor(pseudonymId: string): { result: OmrExerciseResult; pageStats: OmrPageStats }[] {
    return this.byPseudonym.get(pseudonymId) ?? [];
  }

  summary(): OmrSummary {
    return {
      alignmentFailures: this.alignmentFailures,
      minFiducialsFound: this.minFiducialsFound,
      missingCorners: Array.from(this.missingCorners),
    };
  }
}

type ScanSource =
  | { kind: "pdf"; file: File; pdf: PDFDocumentProxy; loadingTask: PDFDocumentLoadingTask }
  | { kind: "image"; file: File };

/** PASS 1: opens every PDF to learn the total page count for the progress bar. */
/** Opens every upload at once (all stay open for PASS 2 anyway); sources and warnings keep the upload order. */
async function openSources(files: File[], warnings: IngestWarning[]) {
  const opened = await Promise.all(files.map(openSource));
  const sources: ScanSource[] = [];
  for (const { source, warning } of opened) {
    if (source) sources.push(source);
    if (warning) warnings.push(warning);
  }
  const totalPages = sources.reduce((n, s) => n + (s.kind === "pdf" ? s.pdf.numPages : 1), 0);
  return { sources, totalPages };
}

async function openSource(file: File): Promise<{ source?: ScanSource; warning?: IngestWarning }> {
  if (!isPdfFile(file)) return { source: { kind: "image", file } };
  try {
    const pdfjsLib = await loadPdfjs();
    // Pass bytes via `{ data }`: a blob: `{ url }` makes pdf.js fetch it, which CSP connect-src blocks (same pattern as PASS 2).
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    return { source: { kind: "pdf", file, pdf: await loadingTask.promise, loadingTask } };
  } catch (error) {
    console.error("Failed to load PDF:", error);
    return { warning: { kind: "pdfUnreadable", fileName: file.name, error } };
  }
}

async function renderPage(page: PDFPageProxy, viewport: PageViewport): Promise<ImageData> {
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, canvas, viewport } as any).promise;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** What a page's QR codes say: the student (a sticker, or the ID in a personalised page code), its printed page number, whether the page code belongs to another exam, and an ID no student has. */
export interface PageCodes {
  student: QrResult | null;
  page?: number;
  foreign: boolean;
  unknownId?: string;
}

/** *ids* maps sticker IDs to the students' sticker payloads (`stickerIdMap`). */
export function classifyCodes(texts: readonly string[], tag: string, ids: ReadonlyMap<string, string> = new Map()): PageCodes {
  let student: QrResult | null = null;
  let page: number | undefined;
  let foreign = false;
  let unknownId: string | undefined;
  for (const text of texts) {
    const code = parsePageCode(text);
    if (!code) {
      student ??= qrResultOf(text);
      continue;
    }
    if (code.tag !== tag) {
      foreign = true;
      continue;
    }
    page ??= code.page;
    if (!code.id) continue;
    const raw = ids.get(code.id);
    if (raw) student = qrResultOf(raw);
    else unknownId = code.id;
  }
  const own = page !== undefined;
  return { student: foreign && !own ? null : student, page, foreign: foreign && !own, ...(unknownId && !student ? { unknownId } : {}) };
}

/** Sticker ID -> sticker payload of the exam's students, for personalised page codes; an ID two students share maps to neither. */
export function stickerIdMap(students: readonly StudentRecord[]): Map<string, string> {
  const ids = new Map<string, string>();
  const shared = new Set<string>();
  for (const st of students) {
    const raw = stickerRawOf(st);
    const id = raw ? parseStudentQr(raw)?.studentNumber?.trim() : undefined;
    if (!raw || !id) continue;
    if (ids.has(id) && ids.get(id) !== raw) shared.add(id);
    ids.set(id, raw);
  }
  for (const id of shared) ids.delete(id);
  return ids;
}

/** Where a page code can sit, as fractions of an A4 page with a margin for skewed scans: 77-91 mm from the cut side, 6-20 mm from the top (Schulaufgabe.sty section 11, lib/qr/cutCorner.ts PAGE_CODE). */
const CODE_SPOT = { from: 69 / 210, to: 99 / 210, top: 0, bottom: 28 / 297 };
/** Render scale of the closer look: about 430 dpi. */
const CODE_SPOT_SCALE = 6;

async function renderCodeSpot(page: PDFPageProxy, side: "left" | "right"): Promise<ImageData> {
  const base = page.getViewport({ scale: CODE_SPOT_SCALE });
  const x0 = Math.round(base.width * (side === "left" ? CODE_SPOT.from : 1 - CODE_SPOT.to));
  const w = Math.round(base.width * (CODE_SPOT.to - CODE_SPOT.from));
  const h = Math.round(base.height * CODE_SPOT.bottom);
  const viewport = page.getViewport({ scale: CODE_SPOT_SCALE, offsetX: -x0, offsetY: 0 });
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, canvas, viewport } as any).promise;
  return ctx.getImageData(0, 0, w, h);
}

async function decodeQr(pool: IngestDeps["qrPool"], imageData: ImageData): Promise<string[]> {
  if (!pool) return [];
  try {
    const res = await pool.dispatch({ type: "QR_DECODE", imageData });
    return res.type === "QR_CODES" ? res.texts : [];
  } catch {
    return []; // No QR on this page
  }
}

/** PASS 2 state: pages are scanned and grouped one at a time so only one page's pixels are alive. */
class ScanPass {
  readonly collector = new BookletCollector();
  readonly omr = new OmrAccumulator();
  processedPages = 0;

  constructor(
    private readonly deps: IngestDeps,
    private readonly omrRun: OmrRunInfo,
    private readonly totalPages: number,
    private readonly warnings: IngestWarning[],
    /** Sticker ID -> sticker payload, for personalised page codes. */
    private readonly ids: ReadonlyMap<string, string> = new Map(),
  ) {}

  async scan(source: ScanSource): Promise<void> {
    const fileName = source.file.name;
    if (source.kind !== "pdf") {
      // Image files are no longer supported — skip with warning
      console.warn(`Skipping unsupported file type (image): ${fileName}. Only PDF files are supported.`);
      this.warnings.push({ kind: "unsupportedFile", fileName });
      return;
    }

    // Load the same file with pdf-lib for page copying
    const fileBytes = await source.file.arrayBuffer();
    const { PDFDocument: PDFDocClass } = await import("pdf-lib");
    const pdfLibDoc = await PDFDocClass.load(fileBytes, { ignoreEncryption: true });
    // A4 halves of unfolded A3 booklet sheets, created on first need.
    let halves: PDFDocument | null = null;

    for (let pIdx = 1; pIdx <= source.pdf.numPages; pIdx++) {
      const page = await source.pdf.getPage(pIdx);
      // ~200 DPI; must equal the scanScale the OMR worker is told, or bubble geometry breaks.
      const viewport = page.getViewport({ scale: this.omrRun.params.scanScale });
      const imageData = await renderPage(page, viewport); // NOSONAR: one page at a time keeps only one page's pixels alive
      const libPage = pdfLibDoc.getPage(pIdx - 1);

      if (isA3Landscape(libPage)) {
        // An unfolded booklet sheet: each half is its own page; the A3 original stays with the scan.
        halves ??= await PDFDocClass.create();
        const [left, right] = await splitA3(halves, libPage); // NOSONAR: sequential on purpose
        const original = { doc: pdfLibDoc, index: pIdx - 1 };
        // Right half first: a sheet's front right page (2s+1) carries its sticker spot, so its left half follows the right student.
        await this.processPage(fileName, halfImage(imageData, "right"), { doc: halves, index: right, original }); // NOSONAR: one page at a time
        await this.processPage(fileName, halfImage(imageData, "left"), { doc: halves, index: left, original }, false); // NOSONAR: one page at a time
      } else {
        // Scan and group immediately, dropping imageData after use
        await this.processPage(fileName, imageData, { doc: pdfLibDoc, index: pIdx - 1 }, true, () => this.decodeCodeSpots(page)); // NOSONAR: one page at a time keeps only one page's pixels alive
      }

      page.cleanup();
    }

    await source.loadingTask.destroy();
  }

  /** Renders the page code's two possible spots (odd and even pages) closer and decodes them: a code the full-page pass missed is usually read there. */
  private async decodeCodeSpots(page: PDFPageProxy): Promise<string[]> {
    const texts: string[] = [];
    for (const side of ["left", "right"] as const) texts.push(...(await decodeQr(this.deps.qrPool, await renderCodeSpot(page, side)))); // NOSONAR: one spot at a time
    return texts;
  }

  /** *counts* is false for the second half of a split A3 page, so progress and page counts follow the uploaded pages. *retry* decodes the page code's spots when the first pass found no page code. */
  private async processPage(fileName: string, imageData: ImageData, pageRef: PdfPageRef, counts = true, retry?: () => Promise<string[]>): Promise<void> {
    if (counts) this.processedPages++;
    this.deps.onProgress?.({
      phase: "scanning",
      progress: Math.round((this.processedPages / Math.max(this.totalPages, 1)) * 50),
      current: this.processedPages,
      total: this.totalPages,
      fileName,
    });

    const tag = examTag(this.deps.examId);
    let texts = await decodeQr(this.deps.qrPool, imageData);
    if (this.deps.pageCodes && retry && !texts.some((t) => parsePageCode(t))) texts = [...texts, ...(await retry())];
    const codes = classifyCodes(texts, tag, this.ids);
    if (codes.foreign) this.warnings.push({ kind: "foreignPage", fileName });
    if (codes.unknownId) this.warnings.push({ kind: "unknownId", fileName, id: codes.unknownId });
    if (codes.page !== undefined) pageRef.page = codes.page;
    // Pages are stored exactly as scanned, never painted over: an uncut name corner stays visible, as exports must show the original (issue #211).
    const booklet = this.collector.addPage(codes.student, pageRef, { foreign: codes.foreign, unknownId: codes.unknownId });
    await this.detectOmr(fileName, imageData, booklet, pageRef);
    this.deps.monitor?.checkMemoryHealth();
  }

  // Reuses the imageData rasterized for the QR decode. The template page is the one the page code names; without codes a booklet page maps 1:1 to the blank template's page index (the exam's own page order).
  private async detectOmr(fileName: string, imageData: ImageData, booklet: StudentBooklet, pageRef: PdfPageRef): Promise<void> {
    const ctx = this.deps.getOmrContext();
    if (!this.deps.omrPool || !ctx) return;
    const coded = booklet.pageRefs.some((r) => r.page !== undefined);
    // A code-less page in a coded booklet has no known place: no OMR rather than the wrong template.
    if (coded && pageRef.page === undefined) return;
    const pageTemplate = ctx.templatePages[(pageRef.page ?? booklet.pageRefs.length) - 1];
    if (!pageTemplate || (pageTemplate.bubbles.length === 0 && pageTemplate.fiducials.length === 0)) return;
    try {
      const res = await this.deps.omrPool.dispatch({
        type: "OMR_PROCESS",
        imageData,
        pageTemplate,
        scanScale: this.omrRun.params.scanScale,
        answerKeys: ctx.answerKeys,
        params: this.omrRun.params,
      });
      if (res.type === "OMR_RESULT") this.omr.add(booklet.pseudonymId, res);
    } catch (error) {
      console.warn(`OMR processing failed for page in ${fileName}:`, error);
      this.warnings.push({ kind: "omrFailed", fileName, error });
    }
  }
}

/** The student row a scan writes: a student already in the exam (from the Students page) keeps name, e-mail, Mebis/Artemis ids and list flag, and the scan only fills what is empty. The save replaces the whole sealed record, so without this a scan would erase an imported address. */
export function mergeScannedStudent(existing: StudentRecord | undefined, scanned: StudentRecord): StudentRecord {
  if (!existing) return scanned;
  return {
    ...scanned,
    studentName: existing.studentName || scanned.studentName,
    studentNumber: existing.studentNumber || scanned.studentNumber,
    fallbackCode: existing.fallbackCode || scanned.fallbackCode,
    email: existing.email,
    mebisId: existing.mebisId,
    artemisId: existing.artemisId,
    fromList: existing.fromList,
  };
}

/** The order a booklet's pages are stored in: by printed page 1..n when pages carry codes (a placeholder for each one missing, n = the template's page count or the highest code seen), then pages scanned twice or without a readable code, in scan order. Without codes: scan order. Every scanned page appears exactly once. */
export function bookletLayout(refs: readonly PdfPageRef[], templatePages = 0): { slots: (PdfPageRef | number)[]; extras: PdfPageRef[] } {
  if (!refs.some((r) => r.page !== undefined)) return { slots: [...refs], extras: [] };
  const last = Math.max(templatePages, ...refs.map((r) => r.page ?? 0));
  const byPage = new Map<number, PdfPageRef>();
  const extras: PdfPageRef[] = [];
  for (const ref of refs) {
    if (ref.page !== undefined && ref.page <= last && !byPage.has(ref.page)) byPage.set(ref.page, ref);
    else extras.push(ref);
  }
  const slots: (PdfPageRef | number)[] = [];
  for (let page = 1; page <= last; page++) slots.push(byPage.get(page) ?? page);
  return { slots, extras };
}

/** A submission of this student whose scan still has placeholders: new pages fill them instead of starting a second submission. *submissions* are the exam's, read once per upload. */
async function submissionWithPlaceholders(examId: string, pseudonymHmac: string, key: CryptoKey | null, submissions: readonly SubmissionRecord[]): Promise<{ id: string; createdAt: string; doc: PDFDocument } | null> {
  if (!key) return null;
  const lib = await import("pdf-lib");
  const own = submissions.filter((s) => s.pseudonymHmac === pseudonymHmac);
  for (const summary of own) {
    const sub = summary.scanCt ? summary : await submissionRepository.getById(examId, summary.id, key);
    if (!sub?.scanCt || !sub.scanIv) continue;
    const doc = await lib.PDFDocument.load(await openScan(sub.id, sub.scanCt, sub.scanIv, key), { ignoreEncryption: true });
    if (doc.getPages().some((p) => placeholderOf(lib, p) !== null)) return { id: sub.id, createdAt: sub.createdAt, doc };
  }
  return null;
}

/** Assembles the booklet PDF (filling an earlier scan's placeholders when there is one), seals it and writes student, submission and OMR scores through their repositories. *known* holds the exam's students by join key; *templatePages* is the exam's page count when known. */
export async function saveBooklet(
  booklet: StudentBooklet,
  deps: Pick<IngestDeps, "examId" | "getSessionKey">,
  omrRun: OmrRunInfo,
  omrResults: { result: OmrExerciseResult; pageStats: OmrPageStats }[],
  known: ReadonlyMap<string, StudentRecord> = new Map(),
  more: { templatePages?: number; warnings?: IngestWarning[]; submissions?: readonly SubmissionRecord[] } = {},
): Promise<void> {
  const { templatePages = 0, warnings = [], submissions = [] } = more;
  const { examId } = deps;
  const lib = await import("pdf-lib");
  const key = deps.getSessionKey();
  // The raw QR value never becomes a key or a plain column: it is keyed per exam and sealed into the identity (issue #177).
  const pseudonym = await pseudonymFor(examId, booklet.pseudonymId);
  const coded = booklet.pageRefs.some((r) => r.page !== undefined);
  const earlier = coded && !booklet.isUnmatched ? await submissionWithPlaceholders(examId, pseudonym.pseudonymHmac, key, submissions) : null;

  const assembledPdf = await lib.PDFDocument.create();
  const { slots, extras } = bookletLayout(booklet.pageRefs, templatePages);
  const missing: number[] = [];
  const copy = async (ref: PdfPageRef) => assembledPdf.addPage((await assembledPdf.copyPages(ref.doc, [ref.index]))[0]);
  if (earlier) {
    // Earlier pages stay where they are; a placeholder gives way to its page from this scan. Every other new page goes after them.
    const fresh = new Map(slots.filter((s): s is PdfPageRef => typeof s !== "number").map((r) => [r.page, r]));
    const used = new Set<PdfPageRef>();
    for (const [i, page] of earlier.doc.getPages().entries()) {
      const wanted = placeholderOf(lib, page);
      const ref = wanted === null ? undefined : fresh.get(wanted);
      if (ref) {
        await copy(ref); // NOSONAR: page order matters
        used.add(ref);
      } else {
        assembledPdf.addPage((await assembledPdf.copyPages(earlier.doc, [i]))[0]);
        if (wanted !== null) missing.push(wanted);
      }
    }
    for (const ref of booklet.pageRefs) if (!used.has(ref)) await copy(ref); // NOSONAR: page order matters
  } else {
    for (const slot of slots) {
      if (typeof slot === "number") {
        await addPlaceholderPage(lib, assembledPdf, slot); // NOSONAR: page order matters
        missing.push(slot);
      } else await copy(slot); // NOSONAR: page order matters
    }
    for (const ref of extras) await copy(ref); // NOSONAR: page order matters
  }
  // The unsplit A3 sheets stay with the student's scan (exported and erased with it).
  const originals = booklet.pageRefs.flatMap((r) => (r.original ? [r.original] : []));
  if (originals.length) await attachOriginals(lib, assembledPdf, originals, earlier?.doc ?? null);
  else if (earlier) await carryAttachments(lib, earlier.doc, assembledPdf);
  const label = booklet.studentName || booklet.fallbackCode;
  if (missing.length) warnings.push({ kind: "missingPages", student: label, pages: missing });
  if (!earlier && extras.length) warnings.push({ kind: "extraPages", student: label, count: extras.length });
  const scanBuffer = await assembledPdf.save();

  // The id first: the scan's ciphertext is bound to its submission (AAD, issue #178).
  const subId: string = earlier?.id ?? crypto.randomUUID();
  let scanCt: Uint8Array | undefined;
  let scanIv: Uint8Array | undefined;
  if (key) ({ ct: scanCt, iv: scanIv } = await sealScan(subId, scanBuffer, key));

  const scanned: StudentRecord = {
    ...pseudonym,
    examId,
    fallbackCode: booklet.fallbackCode,
    studentName: booklet.studentName,
    studentNumber: booklet.studentNumber,
    piiCt: new Uint8Array([0]),
    piiIv: new Uint8Array(12),
  };
  await saveStudentEncrypted(mergeScannedStudent(known.get(await joinKey(scanned)), scanned), key);

  await saveSubmissionEncrypted(
    {
      id: subId,
      examId,
      pseudonymHmac: pseudonym.pseudonymHmac,
      pseudonymVersion: pseudonym.pseudonymVersion,
      scanCt,
      scanIv: scanIv || new Uint8Array(12),
      createdAt: earlier?.createdAt ?? new Date().toISOString(),
    },
    key,
  );

  // Written once per booklet, not per MC question and pupil: hundreds of sequential requests in server mode.
  const omrScores: ExerciseScoreRecord[] = omrResults.map(({ result, pageStats }) =>
    buildOmrScoreRecord(result, { id: crypto.randomUUID(), submissionId: subId, run: omrRun, pageStats }),
  );
  await scoreRepository.saveMany(examId, subId, omrScores, key);
}

/** One OMR settings snapshot covers the whole batch. A storage failure throws with the earlier booklets already saved (no rollback); the caller reports it. */
export async function ingestScans(files: File[], deps: IngestDeps): Promise<IngestResult> {
  const report = deps.onProgress;
  const warnings: IngestWarning[] = [];
  const omrRun = createOmrRun("scan", deps.omrSettings, deps.omrTemplateHash);

  report?.({ phase: "analyzing", progress: 0 });
  const { sources, totalPages } = await openSources(files, warnings);

  // Read once, before scanning (personalised page codes name students by sticker ID) and before writing: a failed read throws, so an imported class list is never overwritten blindly.
  const existing = sources.length ? await studentRepository.getByExamId(deps.examId, deps.getSessionKey()) : [];
  const pass = new ScanPass(deps, omrRun, totalPages, warnings, stickerIdMap(existing));
  for (const source of sources) await pass.scan(source);

  const { booklets } = pass.collector;
  const existingKeys = await joinKeys(existing);
  const known = new Map(existing.map((st, i) => [existingKeys[i], st]));
  // Earlier scans with placeholders get filled (issue #220); read once, and only for page-coded uploads.
  const coded = booklets.some((b) => b.pageRefs.some((r) => r.page !== undefined));
  const submissions = coded ? await submissionRepository.getByExamId(deps.examId, deps.getSessionKey()) : [];
  const templatePages = deps.getOmrContext()?.templatePages.length ?? 0;
  let bookletCount = 0;
  for (let bIdx = 0; bIdx < booklets.length; bIdx++) {
    const booklet = booklets[bIdx];
    report?.({
      phase: "saving",
      progress: 50 + Math.round(((bIdx + 1) / Math.max(booklets.length, 1)) * 50),
      current: bIdx + 1,
      total: booklets.length,
      pages: booklet.pageRefs.length,
    });
    await saveBooklet(booklet, deps, omrRun, pass.omr.resultsFor(booklet.pseudonymId), known, { templatePages, warnings, submissions }); // NOSONAR: one booklet at a time keeps memory bounded and leaves the earlier ones saved when a later one fails
    bookletCount++;
  }

  return { fileCount: files.length, pageCount: pass.processedPages, bookletCount, warnings, omr: pass.omr.summary() };
}
