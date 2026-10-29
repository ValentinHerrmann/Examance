/** Scan ingest: uploaded PDFs -> QR decode (+ OMR) per page -> one encrypted booklet per student. No UI here (no dialogs, no component state): the scan page renders `onProgress` and the result. */
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import type { PDFDocument } from "pdf-lib";
import { loadPdfjs } from "#lib/pdf/pdfjs";
import { encrypt } from "#lib/crypto/aesGcm";
import { saveStudentEncrypted, saveSubmissionEncrypted } from "#lib/db/dbEncryption";
import type { ExerciseScoreRecord, OmrPageTemplate } from "#lib/db/schema";
import { buildOmrScoreRecord } from "#lib/grading/omrResult";
import { createOmrRun, type OmrPageStats, type OmrRunInfo, type OmrSettingsProfile } from "#lib/grading/omrSettings";
import { scoreRepository } from "#lib/repositories/scoreRepository";
import { parseStudentQr } from "#lib/utils/studentQr";
import { randomCode } from "#lib/utils/randomCode";
import type { QrWorkerRequest, QrWorkerResponse } from "#lib/workers/qrWorker";
import type {
  OmrExerciseAnswerKey,
  OmrExerciseResult,
  OmrWorkerRequest,
  OmrWorkerResponse,
} from "#lib/workers/omrWorker";

export interface PdfPageRef {
  doc: PDFDocument;
  index: number;
}

export interface StudentBooklet {
  pseudonymId: string;
  fallbackCode: string;
  studentName?: string;
  studentNumber?: string;
  isUnmatched: boolean;
  pageRefs: PdfPageRef[];
}

export type QrResult = Extract<QrWorkerResponse, { type: "QR_RESULT" }>;
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
  | { kind: "omrFailed"; fileName: string; error: unknown };

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
}

export function isPdfFile(file: Pick<File, "name" | "type">): boolean {
  return file.type === "application/pdf" || file.name.endsWith(".pdf");
}

/** Groups scanned pages into per-student booklets, in scan order. */
export class BookletCollector {
  readonly booklets: StudentBooklet[] = [];
  private current: StudentBooklet | null = null;

  /** A QR page joins the booklet of its pseudonym (current one first, then any earlier one) or opens a new one. A page without QR continues the current booklet, or opens an unmatched one if there is none yet. */
  addPage(qr: QrResult | null, pageRef: PdfPageRef): StudentBooklet {
    if (qr) {
      if (this.current?.pseudonymId !== qr.pseudonymId) {
        this.current = this.booklets.find((b) => b.pseudonymId === qr.pseudonymId) ?? this.open(bookletFromQr(qr));
      }
    } else {
      this.current ??= this.open({
        pseudonymId: crypto.randomUUID(),
        fallbackCode: `UNMATCHED-${randomCode()}`,
        isUnmatched: true,
        pageRefs: [],
      });
    }
    this.current.pageRefs.push(pageRef);
    return this.current;
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
  private missingCorners = new Set<string>();

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

async function renderPage(page: PDFPageProxy, scale: number): Promise<ImageData> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, canvas, viewport } as any).promise;
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

async function decodeQr(
  pool: IngestDeps["qrPool"],
  imageData: ImageData,
): Promise<QrResult | null> {
  if (!pool) return null;
  try {
    const res = await pool.dispatch({ type: "QR_DECODE", imageData });
    return res.type === "QR_RESULT" ? res : null;
  } catch {
    return null; // No QR on this page
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

    for (let pIdx = 1; pIdx <= source.pdf.numPages; pIdx++) {
      const page = await source.pdf.getPage(pIdx);
      // ~200 DPI; must equal the scanScale the OMR worker is told, or bubble geometry breaks.
      const imageData = await renderPage(page, this.omrRun.params.scanScale);

      // Scan and group immediately, dropping imageData after use
      await this.processPage(fileName, imageData, { doc: pdfLibDoc, index: pIdx - 1 });

      page.cleanup();
    }

    await source.loadingTask.destroy();
  }

  private async processPage(fileName: string, imageData: ImageData, pageRef: PdfPageRef): Promise<void> {
    this.processedPages++;
    this.deps.onProgress?.({
      phase: "scanning",
      progress: Math.round((this.processedPages / Math.max(this.totalPages, 1)) * 50),
      current: this.processedPages,
      total: this.totalPages,
      fileName,
    });

    const qr = await decodeQr(this.deps.qrPool, imageData);
    const booklet = this.collector.addPage(qr, pageRef);
    await this.detectOmr(fileName, imageData, booklet);
    this.deps.monitor?.checkMemoryHealth();
  }

  // Reuses the imageData rasterized for the QR decode. A booklet page maps 1:1 to the blank template's page index, since a scanned booklet follows the exam's own page order.
  private async detectOmr(fileName: string, imageData: ImageData, booklet: StudentBooklet): Promise<void> {
    const ctx = this.deps.getOmrContext();
    if (!this.deps.omrPool || !ctx) return;
    const pageTemplate = ctx.templatePages[booklet.pageRefs.length - 1];
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

/** Assembles the booklet PDF, seals it and writes student, submission and OMR scores through their repositories. */
export async function saveBooklet(
  booklet: StudentBooklet,
  deps: Pick<IngestDeps, "examId" | "getSessionKey">,
  omrRun: OmrRunInfo,
  omrResults: { result: OmrExerciseResult; pageStats: OmrPageStats }[],
): Promise<void> {
  const { examId } = deps;
  const { PDFDocument: PDFDocClass } = await import("pdf-lib");
  const assembledPdf = await PDFDocClass.create();
  for (const ref of booklet.pageRefs) {
    const copiedPages = await assembledPdf.copyPages(ref.doc, [ref.index]);
    assembledPdf.addPage(copiedPages[0]);
  }
  const scanBuffer = await assembledPdf.save();

  let scanCt: Uint8Array | undefined;
  let scanIv: Uint8Array | undefined;
  const sealKey = deps.getSessionKey();
  if (sealKey) {
    const encRes = await encrypt(sealKey, scanBuffer);
    scanCt = encRes.ciphertext;
    scanIv = encRes.iv;
  }

  const key = deps.getSessionKey();
  await saveStudentEncrypted(
    {
      pseudonymId: booklet.pseudonymId,
      examId,
      fallbackCode: booklet.fallbackCode,
      studentName: booklet.studentName,
      studentNumber: booklet.studentNumber,
      piiCt: new Uint8Array([0]),
      piiIv: new Uint8Array(12),
    },
    key,
  );

  const subId: string = crypto.randomUUID();
  await saveSubmissionEncrypted(
    {
      id: subId,
      examId,
      pseudonymHash: booklet.pseudonymId,
      scanCt,
      scanIv: scanIv || new Uint8Array(12),
      createdAt: new Date().toISOString(),
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

  const pass = new ScanPass(deps, omrRun, totalPages, warnings);
  for (const source of sources) await pass.scan(source);

  const { booklets } = pass.collector;
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
    await saveBooklet(booklet, deps, omrRun, pass.omr.resultsFor(booklet.pseudonymId));
    bookletCount++;
  }

  return { fileCount: files.length, pageCount: pass.processedPages, bookletCount, warnings, omr: pass.omr.summary() };
}
