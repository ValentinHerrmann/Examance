/** Raw exam export (issue #82): graded scans, LaTeX source, compiled PDFs, summary and grades as one plaintext ZIP. */
import { get } from 'svelte/store';
import { buildGradesCsv } from '#lib/analytics/csvExport';
import { buildGradeRows, computeExamResults, gradingState, type GradeRow, type GradingState } from '#lib/analytics/examResults';
import { logExportAction } from '#lib/gdpr/exportAudit';
import { buildExamItems, loadExamCompileContext } from '#lib/grading/omrTemplatePrep';
import { compileExamPreview, prepareExamSources } from '#lib/exam/examPreview';
import { translate, type TranslationKey } from '#lib/i18n';
import { mergeResources } from '#lib/latex/resources';
import { stripSourceMarkers } from '#lib/latex/sourceMap';
import { scoreRepository } from '#lib/repositories/scoreRepository';
import { studentRepository } from '#lib/repositories/studentRepository';
import { submissionRepository } from '#lib/repositories/submissionRepository';
import { awaitSessionReady, sessionStore } from '#lib/stores/session';
import { renderGradedPdf } from './gradedPdf';
import { DEFAULT_REVIEW_PRINT_MODE, type ReviewPrintMode } from './reviewPrint';
import { reviewRepository } from '#lib/repositories/reviewRepository';
import { loadScoreBoxContext } from '#lib/grading/scoreBoxes';
import { addLatexProjectFiles } from './latexAssets';
import type { ExportProgress, ExportResult } from './progress';
import { renderSummaryPdf, type SummaryInput } from './summaryPdf';
import { exportDateStamp, firstFree, slug, ZipBuilder } from './zip';
import { addExerciseFolder } from './exerciseExport';
import { exerciseEntry, manifestHeader, ZIP_MANIFEST, type ExamZipManifest } from './zipManifest';
import { examRepository } from '#lib/repositories/examRepository';
import { getAccountPackages } from '#lib/latex/packageSettings';
import type { ExerciseRecord, GradingReviewItem } from '#lib/db/schema';
import { snapshotRecords } from '#lib/analytics/statisticsSnapshot';
import { statisticsRepository } from '#lib/repositories/statisticsRepository';

export type ExamExportPart = 'graded' | 'gradedCombined' | 'latex' | 'pdf' | 'summary' | 'csv';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const GRADED_SUFFIX: Record<GradingState, string> = { complete: '', partial: '_partial', ungraded: '_ungraded' };

type ExamContext = NonNullable<Awaited<ReturnType<typeof loadExamCompileContext>>>;
type CompileInput = ExamContext & { examItems: ReturnType<typeof buildExamItems>; key: CryptoKey };

export async function runExamExport(
  examId: string,
  selected: Set<string>,
  progress: ExportProgress,
  reviewMode: ReviewPrintMode = DEFAULT_REVIEW_PRINT_MODE
): Promise<ExportResult> {
  await awaitSessionReady();
  const { sessionKey: key, fallbackSessionKey } = get(sessionStore);
  if (!key) throw new Error(translate('dashboard.sessionState.lockedTitle'));

  progress(translate('export.exam.steps.loading'));
  const ctx = await loadExamCompileContext(examId, key);
  if (!ctx) throw new Error(translate('exam.page.examNotFoundOrDeleted'));
  const compileInput: CompileInput = { ...ctx, examItems: buildExamItems(ctx.exercises, ctx.mcGroups), key };
  const examSlug = slug(ctx.exam.title || 'exam');

  const zip = new ZipBuilder();
  const warnings: string[] = [];
  /** A failing part becomes a warning; the other parts still go into the ZIP. */
  const part = async (name: TranslationKey, run: () => Promise<void>) => {
    try {
      await run();
    } catch (err) {
      warnings.push(translate('export.exam.warnings.failed', { part: translate(name), error: errorText(err) }));
    }
  };
  const has = (p: ExamExportPart) => selected.has(p);

  // Every run exports plaintext personal data, whichever parts are chosen.
  await logExportAction(examId, 'ZIP', key);

  if (has('latex')) {
    await part('export.exam.options.latex', async () => {
      progress(translate('export.exam.steps.latex'));
      zip.add(`${examSlug}_latex.zip`, await buildLatexZip(compileInput));
      // The exam and its exercises in importable form: this ZIP can be imported again (issue #145).
      warnings.push(...(await addReimportData(zip, compileInput)));
    });
  }
  if (has('pdf')) {
    await part('export.exam.options.pdf', async () => {
      progress(translate('export.exam.steps.compiling'));
      warnings.push(...(await addCompiledPdfs(zip, compileInput)));
    });
  }
  if (has('graded') || has('gradedCombined') || has('summary') || has('csv')) {
    await addResultParts({ zip, ctx, compileInput, examSlug, key, fallbackKey: fallbackSessionKey, has, part, progress, warnings, reviewMode });
  }

  return { zip, fileName: `${examSlug}_${exportDateStamp()}.zip`, warnings };
}

/** One exam as `runExamExport`; several as one ZIP with a folder per exam, warnings prefixed with the exam title (issue #261). */
export async function runExamsExport(
  exams: readonly { id: string; title: string }[],
  selected: Set<string>,
  progress: ExportProgress,
  reviewMode: ReviewPrintMode = DEFAULT_REVIEW_PRINT_MODE
): Promise<ExportResult> {
  if (exams.length === 1) return runExamExport(exams[0].id, selected, progress, reviewMode);
  const zip = new ZipBuilder();
  const warnings: string[] = [];
  for (const [i, exam] of exams.entries()) {
    const title = exam.title || translate('dashboard.examList.untitledExam');
    const step: ExportProgress = (s, done, total) => progress(translate('export.exam.steps.ofMany', { n: i + 1, total: exams.length, step: s }), done, total);
    try {
      const res = await runExamExport(exam.id, selected, step, reviewMode); // NOSONAR: one exam at a time keeps memory bounded
      zip.merge(slug(title, 'exam'), res.zip);
      warnings.push(...res.warnings.map((w) => `${title}: ${w}`));
    } catch (err) {
      warnings.push(`${title}: ${errorText(err)}`);
    }
  }
  return { zip, fileName: `exams_${exportDateStamp()}.zip`, warnings };
}

/** The parts built from the results: grades CSV, summary and the graded scans (one render pass feeds both the single files and the combined print file). */
async function addResultParts(o: {
  zip: ZipBuilder;
  ctx: ExamContext;
  compileInput: CompileInput;
  examSlug: string;
  key: CryptoKey;
  fallbackKey: CryptoKey | null;
  has: (p: ExamExportPart) => boolean;
  part: (name: TranslationKey, run: () => Promise<void>) => Promise<void>;
  progress: ExportProgress;
  warnings: string[];
  reviewMode: ReviewPrintMode;
}): Promise<void> {
  const { zip, ctx, has, progress } = o;
  progress(translate('export.exam.steps.results'));
  const results = await loadResults(o.compileInput);
  if (has('csv')) zip.add('grades.csv', buildGradesCsv(results.rows));
  if (has('summary')) {
    await o.part('export.exam.options.summary', async () => {
      progress(translate('export.exam.steps.summary'));
      zip.add('summary.pdf', await renderSummaryPdf(await summaryInput(ctx.exam, o.compileInput.exercises, results, o.key)));
    });
  }
  if (!has('graded') && !has('gradedCombined')) return;
  const combined = has('gradedCombined') ? await pdfCollector(ctx.exam.title || 'exam', true) : null;
  o.warnings.push(...(await addGradedScans(zip, results, o.key, o.fallbackKey, progress, has('graded'), combined, o.reviewMode)));
  if (combined && combined.pageCount > 0) zip.add(`${o.examSlug}_graded_all.pdf`, await combined.save());
}

/** `manifest.json` plus one `exercises/<name>/` folder per linked exercise, read back by `archive/zipImport.ts`. Settings only: results, scans and the logo never go into a re-importable ZIP. */
async function addReimportData(zip: ZipBuilder, input: CompileInput): Promise<string[]> {
  const { exam, exercises, key } = input;
  const warnings: string[] = [];
  const structure = await examRepository.getStructure(exam.id);
  // Folders are claimed first (in order), then the exercises' files load together.
  const taken = new Set<string>();
  const folders = exercises.map((ex) => {
    const name = ex.name || ex.title || translate('exercises.untitled');
    const dir = firstFree(`exercises/${slug(name)}`, (p) => taken.has(p));
    taken.add(dir);
    return { ex, name, dir };
  });
  const entries = await Promise.all(
    folders.map(async ({ ex, name, dir }) => exerciseEntry(ex, name, dir, await addExerciseFolder(zip, ex, name, dir, key, warnings), []))
  );
  const accountPackages = exam.latexPackages == null ? await getAccountPackages() : [];
  const manifest: ExamZipManifest = {
    ...manifestHeader(),
    kind: 'exam',
    exam: {
      id: exam.id,
      title: exam.title,
      testart: exam.testart,
      grade: exam.grade,
      klasse: exam.klasse,
      course: exam.course,
      datum: exam.datum,
      nr: exam.nr,
      fach: exam.fach,
      topic: exam.topic,
      lehrernachname: exam.lehrernachname,
      infoText: exam.infoText,
      latexPreamble: exam.latexPreamble,
      latexTemplate: exam.latexTemplate,
      numVersions: exam.numVersions,
      gradingKey: exam.gradingKey,
      latexPackages: exam.latexPackages ?? null,
      ...(accountPackages.length ? { accountLatexPackages: [...accountPackages] } : {}),
      pageBreaks: exam.pageBreaks ?? null,
      nameLine: exam.nameLine ?? false,
      mcCorrectionHint: exam.mcCorrectionHint ?? false,
      pageCodes: exam.pageCodes ?? false,
      printLayout: exam.printLayout ?? 'duplex',
      stickerSpots: exam.stickerSpots ?? 'cover',
      printMode: exam.printMode ?? 'stickers',
      paperStyle: exam.paperStyle ?? 'empty',
      extraPages: exam.extraPages ?? 0,
      bookletOffsetMm: exam.bookletOffsetMm ?? 0,
      digitalGrading: exam.digitalGrading !== false,
      resultsQrBox: exam.resultsQrBox ?? false,
      extraNotes: exam.extraNotes ?? null,
    },
    exercises: entries,
    links: structure.links.map((l) => ({
      exerciseId: l.exerciseId,
      orderIndex: l.orderIndex ?? 1,
      mcGroupId: l.mcGroupId ?? null,
      subIndex: l.subIndex ?? null,
    })),
    mcGroups: structure.mcGroups.map((g) => ({ id: g.id, title: g.title, scoringText: g.scoringText, orderIndex: g.orderIndex })),
  };
  zip.add(ZIP_MANIFEST, JSON.stringify(manifest, null, 2));
  return warnings;
}

/** The LaTeX sources as their own ZIP, `main.tex` at its root, so Overleaf takes it in one upload. */
async function buildLatexZip(input: CompileInput): Promise<Uint8Array> {
  const src = await prepareExamSources(input, true);
  const latex = new ZipBuilder();
  latex.add('main.tex', stripSourceMarkers(src.angabeTex));
  latex.add('solution.tex', stripSourceMarkers(src.loesungTex));
  for (const file of mergeResources(src.resources)) latex.add(file.filename, file.content);
  if (src.logo?.file) latex.add(src.logo.file.filename, src.logo.file.content);
  await addLatexProjectFiles(latex, '');
  return latex.toBytes();
}

async function addCompiledPdfs(zip: ZipBuilder, input: CompileInput): Promise<string[]> {
  const res = await compileExamPreview(input);
  zip.add('pdf/exam.pdf', res.angabe.pdfBytes);
  zip.add('pdf/solution.pdf', res.loesung.pdfBytes);
  if (!res.missingGraphics.length) return [];
  return [translate('export.exam.warnings.missingGraphics', { files: [...new Set(res.missingGraphics)].join(', ') })];
}

async function summaryInput(exam: ExamContext['exam'], exercises: ExerciseRecord[], results: LoadedResults, key: CryptoKey | null): Promise<SummaryInput> {
  const input = { exam, stats: results.computed.stats, totalMaxPoints: results.computed.totalMaxPoints, rows: results.rows, submissionCount: results.submissions.length };
  if (results.computed.stats.results.length > 0) return input;
  // No results left here: the kept anonymous record (issue #238) gives the summary its numbers, without a student list.
  const stored = await statisticsRepository.findByExam(exam.id, key);
  if (!stored) return input;
  const kept = snapshotRecords(stored.snapshot);
  const computed = computeExamResults(exam, exercises.length ? exercises : kept.exercises, kept.submissions, kept.scores);
  return { exam, stats: computed.stats, totalMaxPoints: computed.totalMaxPoints, rows: [], submissionCount: kept.submissions.length };
}

/** The overview results sheet on its own (the Archive tab previews and downloads it, issue #212); the ZIP's `summary.pdf` is the same document. */
export async function renderExamSummaryPdf(examId: string): Promise<Uint8Array> {
  await awaitSessionReady();
  const key = get(sessionStore).sessionKey;
  if (!key) throw new Error(translate('dashboard.sessionState.lockedTitle'));
  const ctx = await loadExamCompileContext(examId, key);
  if (!ctx) throw new Error(translate('exam.page.examNotFoundOrDeleted'));
  return renderSummaryPdf(await summaryInput(ctx.exam, ctx.exercises, await loadResults({ exam: ctx.exam, exercises: ctx.exercises, key }), key));
}

export type LoadedResults = Awaited<ReturnType<typeof loadResults>>;

/** Students, submissions (without scan bytes; `forEachGradedPdf` fetches each), scores and grade rows of an exam, through the repositories (so from wherever the account's mode keeps results); `rows[i]` belongs to `students[i]`. */
export async function loadResults({ exam, exercises, key }: Pick<CompileInput, 'exam' | 'exercises' | 'key'>) {
  const [submissions, students, scoreRecords] = await Promise.all([
    submissionRepository.getByExamId(exam.id, key),
    studentRepository.getByExamId(exam.id, key),
    scoreRepository.getByExamId(exam.id, key),
  ]);
  const computed = computeExamResults(exam, exercises, submissions, scoreRecords);
  const rows = await buildGradeRows(exam, students, submissions, computed);
  return { submissions, students, scoreRecords, computed, rows };
}

/** Renders one submission at a time to keep memory bounded; a failing scan becomes a warning. */
/** Renders the graded PDF of each submission (one at a time, which keeps memory bounded) and hands it to *onPdf*; a submission without a scan or a failing render becomes a warning. *only* limits it to those submission ids. */
export async function forEachGradedPdf(
  { submissions, scoreRecords, computed, rows }: LoadedResults,
  key: CryptoKey,
  fallbackKey: CryptoKey | null,
  onPdf: (pdf: Uint8Array, row: GradeRow | undefined, state: GradingState, name: string) => Promise<void> | void,
  options: { only?: ReadonlySet<string>; progress?: (done: number, total: number) => void; reviewMode?: ReviewPrintMode } = {}
): Promise<string[]> {
  const warnings: string[] = [];
  const resultBySubmission = new Map(computed.stats.results.map((r) => [r.submissionId, r]));
  const rowBySubmission = new Map<string, GradeRow>(rows.flatMap((r) => (r.submissionId ? [[r.submissionId, r]] : [])));
  const scoresBySubmission = new Map<string, typeof scoreRecords>();
  for (const sc of scoreRecords) scoresBySubmission.set(sc.submissionId, [...(scoresBySubmission.get(sc.submissionId) ?? []), sc]);
  const chosen = options.only ? submissions.filter((sub) => options.only?.has(sub.id)) : submissions;
  const scoreBoxes = chosen.length > 0 ? await loadScoreBoxContext(chosen[0].examId, key) : null;
  const reviewMode = options.reviewMode ?? DEFAULT_REVIEW_PRINT_MODE;
  const reviewBySubmission = new Map<string, GradingReviewItem[]>();
  if (reviewMode !== 'none' && chosen.length > 0) {
    try {
      for (const rec of await reviewRepository.listByExam(chosen[0].examId, key)) reviewBySubmission.set(rec.submissionId, rec.items);
    } catch (err) {
      warnings.push(translate('export.exam.warnings.failed', { part: translate('export.review.title'), error: errorText(err) }));
    }
  }

  for (const [i, sub] of chosen.entries()) {
    options.progress?.(i, chosen.length);
    const row = rowBySubmission.get(sub.id);
    const name = row?.studentName || row?.fallbackCode || `submission_${sub.id.slice(0, 8)}`;
    if (!sub.scanCt && !sub.hasScan) {
      warnings.push(translate('export.exam.warnings.noScan', { name }));
      continue;
    }
    try {
      // Fetched one at a time: memory stays at one scan, and an unreadable scan (a missing file answers 503) costs only this student.
      const full = sub.scanCt ? sub : await submissionRepository.getById(sub.examId, sub.id, key); // NOSONAR: one scan at a time keeps memory bounded
      if (!full?.scanCt) {
        warnings.push(translate('export.exam.warnings.noScan', { name }));
        continue;
      }
      const pdf = await renderGradedPdf(full, scoresBySubmission.get(sub.id) ?? [], key, { fallbackKey, scoreBoxes, studentName: row?.studentName, review: { items: reviewBySubmission.get(sub.id) ?? [], mode: reviewMode } }); // NOSONAR: one scan at a time keeps memory bounded
      await onPdf(pdf, row, gradingState(resultBySubmission.get(sub.id)), name); // NOSONAR: one scan at a time keeps memory bounded
    } catch (err) {
      warnings.push(translate('export.exam.warnings.gradedOne', { name, error: errorText(err) }));
    }
  }
  return warnings;
}

/** Moodle's "upload multiple feedback files in a zip" layout, as DiRueLei writes it (issue #209): one `Participant_<id>_assignsubmission_file_` folder per student; used by the Share page's Mebis channel (`lib/sharing/delivery.ts`). Students without a numeric id are skipped with a warning. */
export function mebisFeedbackPath(name: string, participantId: string): string {
  return `Participant_${participantId}_assignsubmission_file_/${slug(name)}_${participantId}.pdf`;
}

function addGradedScans(
  zip: ZipBuilder,
  results: LoadedResults,
  key: CryptoKey,
  fallbackKey: CryptoKey | null,
  progress: ExportProgress,
  singleFiles: boolean,
  combined: PdfCollector | null,
  reviewMode: ReviewPrintMode
): Promise<string[]> {
  return forEachGradedPdf(
    combined ? byStudentName(results) : results,
    key,
    fallbackKey,
    async (pdf, _row, state, name) => {
      if (singleFiles) zip.add(`graded/${slug(name)}${GRADED_SUFFIX[state]}.pdf`, pdf);
      await combined?.add(pdf);
    },
    { progress: (done, total) => progress(translate('export.exam.steps.graded'), done, total), reviewMode }
  );
}

type PdfCollector = Awaited<ReturnType<typeof pdfCollector>>;

/** Appends PDFs into one document; `duplex` pads each to an even page count, so two-sided printing starts every student on a new sheet. */
async function pdfCollector(title: string, duplex: boolean) {
  const lib = await import('pdf-lib');
  const out = await lib.PDFDocument.create();
  out.setTitle(title);
  return {
    async add(bytes: Uint8Array) {
      const src = await lib.PDFDocument.load(bytes);
      const pages = await out.copyPages(src, src.getPageIndices());
      for (const page of pages) out.addPage(page);
      if (duplex && pages.length % 2 === 1) {
        const { width, height } = pages[pages.length - 1].getSize();
        out.addPage([width, height]);
      }
    },
    get pageCount() {
      return out.getPageCount();
    },
    save: () => out.save(),
  };
}

/** The results with submissions in the order of the student names (a print stack sorted like the class list). */
function byStudentName(results: LoadedResults): LoadedResults {
  const nameOf = new Map(results.rows.flatMap((r) => (r.submissionId ? [[r.submissionId, r.studentName || r.fallbackCode || '']] : [])));
  const submissions = [...results.submissions].sort((a, b) => (nameOf.get(a.id) ?? '').localeCompare(nameOf.get(b.id) ?? '', undefined, { sensitivity: 'base' }));
  return { ...results, submissions };
}

/** Every graded PDF of the exam in one file, sorted by name, for printing and archiving (Archive tab, issue #212); null when no submission has a scan. Writes the export audit entry, as the ZIP does. */
export async function renderCombinedGradedPdf(
  examId: string,
  options: { duplex?: boolean; progress?: (done: number, total: number) => void; reviewMode?: ReviewPrintMode } = {}
): Promise<{ pdf: Uint8Array | null; pageCount: number; warnings: string[] }> {
  await awaitSessionReady();
  const { sessionKey: key, fallbackSessionKey } = get(sessionStore);
  if (!key) throw new Error(translate('dashboard.sessionState.lockedTitle'));
  const ctx = await loadExamCompileContext(examId, key);
  if (!ctx) throw new Error(translate('exam.page.examNotFoundOrDeleted'));
  await logExportAction(examId, 'PDF', key);
  const results = await loadResults({ exam: ctx.exam, exercises: ctx.exercises, key });
  const combined = await pdfCollector(ctx.exam.title || 'exam', options.duplex ?? true);
  const warnings = await forEachGradedPdf(byStudentName(results), key, fallbackSessionKey, (pdf) => combined.add(pdf), { progress: options.progress, reviewMode: options.reviewMode });
  return { pdf: combined.pageCount > 0 ? await combined.save() : null, pageCount: combined.pageCount, warnings };
}
