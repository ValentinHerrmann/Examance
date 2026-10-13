/** Raw exam export (issue #82): graded scans, LaTeX source, compiled PDFs, summary and grades as one plaintext ZIP. */
import { get } from 'svelte/store';
import { buildGradesCsv } from '#lib/analytics/csvExport';
import { buildGradeRows, computeExamResults, type GradeRow, type GradingState } from '#lib/analytics/examResults';
import { logExportAction } from '#lib/gdpr/exportAudit';
import { buildExamItems, loadExamCompileContext } from '#lib/grading/omrTemplatePrep';
import { compileExamPreview, prepareExamSources } from '#lib/exam/examPreview';
import { translate, type TranslationKey } from '#lib/i18n';
import { mergeResources } from '#lib/latex/resources';
import { scoreRepository } from '#lib/repositories/scoreRepository';
import { studentRepository } from '#lib/repositories/studentRepository';
import { submissionRepository } from '#lib/repositories/submissionRepository';
import { awaitSessionReady, sessionStore } from '#lib/stores/session';
import { renderGradedPdf } from './gradedPdf';
import { addLatexProjectFiles } from './latexAssets';
import type { ExportProgress, ExportResult } from './progress';
import { renderSummaryPdf } from './summaryPdf';
import { exportDateStamp, slug, ZipBuilder } from './zip';

export type ExamExportPart = 'graded' | 'latex' | 'pdf' | 'summary' | 'csv';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const GRADED_SUFFIX: Record<GradingState, string> = { complete: '', partial: '_partial', ungraded: '_ungraded' };

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
  const { exam } = ctx;
  const compileInput = { ...ctx, examItems: buildExamItems(ctx.exercises, ctx.mcGroups), key };

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
      const src = await prepareExamSources(compileInput, true);
      zip.add('latex/main.tex', src.angabeTex);
      zip.add('latex/solution.tex', src.loesungTex);
      for (const file of mergeResources(src.resources)) zip.add(`latex/${file.filename}`, file.content);
      if (src.logo?.file) zip.add(`latex/${src.logo.file.filename}`, src.logo.file.content);
      await addLatexProjectFiles(zip, 'latex');
    });
  }

  if (has('pdf')) {
    await part('export.exam.options.pdf', async () => {
      progress(translate('export.exam.steps.compiling'));
      const res = await compileExamPreview(compileInput);
      zip.add('pdf/exam.pdf', res.angabe.pdfBytes);
      zip.add('pdf/solution.pdf', res.loesung.pdfBytes);
      if (res.missingGraphics.length) {
        warnings.push(translate('export.exam.warnings.missingGraphics', { files: [...new Set(res.missingGraphics)].join(', ') }));
      }
    });
  }

  if (has('graded') || has('summary') || has('csv')) {
    progress(translate('export.exam.steps.results'));
    const [submissions, students, scoreRecords] = await Promise.all([
      submissionRepository.getByExamId(examId, key, { includeScans: has('graded') }),
      studentRepository.getByExamId(examId, key),
      scoreRepository.getByExamId(examId, key),
    ]);
    const computed = computeExamResults(exam, ctx.exercises, submissions, scoreRecords);
    const rows = await buildGradeRows(exam, students, submissions, computed);

    if (has('csv')) zip.add('grades.csv', buildGradesCsv(rows));

    if (has('summary')) {
      await part('export.exam.options.summary', async () => {
        progress(translate('export.exam.steps.summary'));
        zip.add(
          'summary.pdf',
          await renderSummaryPdf({ exam, stats: computed.stats, totalMaxPoints: computed.totalMaxPoints, rows, submissionCount: submissions.length })
        );
      });
    }

    if (has('graded')) {
      const stateBySubmission = new Map<string, GradingState>(
        computed.stats.results.map((r) => [r.submissionId, r.isComplete ? 'complete' : 'partial'])
      );
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
          const pdf = await renderGradedPdf(sub, scoresBySubmission.get(sub.id) ?? [], key, { fallbackKey: fallbackSessionKey });
          zip.add(`graded/${slug(name)}${GRADED_SUFFIX[stateBySubmission.get(sub.id) ?? 'ungraded']}.pdf`, pdf);
        } catch (err) {
          warnings.push(translate('export.exam.warnings.gradedOne', { name, error: errorText(err) }));
        }
      }
    }
  }

  return { zip, fileName: `${slug(exam.title || 'exam')}_${exportDateStamp()}.zip`, warnings };
}
