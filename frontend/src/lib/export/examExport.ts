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
import { addLatexProjectFiles } from './latexAssets';
import type { ExportProgress, ExportResult } from './progress';
import { renderSummaryPdf } from './summaryPdf';
import { exportDateStamp, firstFree, slug, ZipBuilder } from './zip';
import { addExerciseFolder } from './exerciseExport';
import { exerciseEntry, manifestHeader, ZIP_MANIFEST, type ExamZipManifest } from './zipManifest';
import { examRepository } from '#lib/repositories/examRepository';
import { getAccountPackages } from '#lib/latex/packageSettings';

export type ExamExportPart = 'graded' | 'latex' | 'pdf' | 'summary' | 'csv';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const GRADED_SUFFIX: Record<GradingState, string> = { complete: '', partial: '_partial', ungraded: '_ungraded' };

type ExamContext = NonNullable<Awaited<ReturnType<typeof loadExamCompileContext>>>;
type CompileInput = ExamContext & { examItems: ReturnType<typeof buildExamItems>; key: CryptoKey };

export async function runExamExport(
  examId: string,
  selected: Set<string>,
  progress: ExportProgress
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
  if (has('graded') || has('summary') || has('csv')) {
    progress(translate('export.exam.steps.results'));
    const results = await loadResults(compileInput, has('graded'));
    if (has('csv')) zip.add('grades.csv', buildGradesCsv(results.rows));
    if (has('summary')) {
      await part('export.exam.options.summary', async () => {
        progress(translate('export.exam.steps.summary'));
        zip.add('summary.pdf', await renderSummaryPdf({
          exam: ctx.exam,
          stats: results.computed.stats,
          totalMaxPoints: results.computed.totalMaxPoints,
          rows: results.rows,
          submissionCount: results.submissions.length,
        }));
      });
    }
    if (has('graded')) warnings.push(...(await addGradedScans(zip, results, key, fallbackSessionKey, progress)));
  }

  return { zip, fileName: `${examSlug}_${exportDateStamp()}.zip`, warnings };
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

type LoadedResults = Awaited<ReturnType<typeof loadResults>>;

async function loadResults({ exam, exercises, key }: CompileInput, includeScans: boolean) {
  const [submissions, students, scoreRecords] = await Promise.all([
    submissionRepository.getByExamId(exam.id, key, { includeScans }),
    studentRepository.getByExamId(exam.id, key),
    scoreRepository.getByExamId(exam.id, key),
  ]);
  const computed = computeExamResults(exam, exercises, submissions, scoreRecords);
  const rows = await buildGradeRows(exam, students, submissions, computed);
  return { submissions, scoreRecords, computed, rows };
}

/** Renders one submission at a time to keep memory bounded; a failing scan becomes a warning. */
async function addGradedScans(
  zip: ZipBuilder,
  { submissions, scoreRecords, computed, rows }: LoadedResults,
  key: CryptoKey,
  fallbackKey: CryptoKey | null,
  progress: ExportProgress
): Promise<string[]> {
  const warnings: string[] = [];
  const resultBySubmission = new Map(computed.stats.results.map((r) => [r.submissionId, r]));
  const rowBySubmission = new Map<string, GradeRow>(rows.flatMap((r) => (r.submissionId ? [[r.submissionId, r]] : [])));
  const scoresBySubmission = new Map<string, typeof scoreRecords>();
  for (const sc of scoreRecords) scoresBySubmission.set(sc.submissionId, [...(scoresBySubmission.get(sc.submissionId) ?? []), sc]);

  for (const [i, sub] of submissions.entries()) {
    progress(translate('export.exam.steps.graded'), i, submissions.length);
    const row = rowBySubmission.get(sub.id);
    const name = row?.studentName || row?.fallbackCode || `submission_${sub.id.slice(0, 8)}`;
    if (!sub.scanCt) {
      warnings.push(translate('export.exam.warnings.noScan', { name }));
      continue;
    }
    try {
      const pdf = await renderGradedPdf(sub, scoresBySubmission.get(sub.id) ?? [], key, { fallbackKey }); // NOSONAR: one scan at a time keeps memory bounded
      zip.add(`graded/${slug(name)}${GRADED_SUFFIX[gradingState(resultBySubmission.get(sub.id))]}.pdf`, pdf);
    } catch (err) {
      warnings.push(translate('export.exam.warnings.gradedOne', { name, error: errorText(err) }));
    }
  }
  return warnings;
}
