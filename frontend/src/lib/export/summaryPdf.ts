/** One-document overview of an exam's results for the raw export: metadata, grading key, statistics, chart and student table. */
import type { PDFFont, PDFPage } from 'pdf-lib';
import { get } from 'svelte/store';
import type { GradeRow } from '#lib/analytics/examResults';
import { buildGradeChartModel } from '#lib/analytics/gradeChartModel';
import { cutoffThreshold, effectiveGradingKey } from '#lib/analytics/gradingKey';
import type { ExamStats } from '#lib/analytics/stats';
import { svgToPdfBytes, toWinAnsi } from '#lib/components/stats/chartExport';
import { renderChartSvg } from '#lib/components/stats/renderChart';
import type { ExamRecord } from '#lib/db/schema';
import { t, translate } from '#lib/i18n';
import { formatDateTime, formatNumber, formatPercent, fmt } from '#lib/utils/format';
import { formatExamCourse } from '#lib/utils/examLabel';

export interface SummaryInput {
  exam: ExamRecord;
  stats: ExamStats;
  totalMaxPoints: number | null;
  rows: GradeRow[];
  /** All submissions of the exam, including ones without a result. */
  submissionCount: number;
}

const PAGE = { width: 595.28, height: 841.89, margin: 40 };
const CONTENT_WIDTH = PAGE.width - 2 * PAGE.margin;
const ROW_HEIGHT = 17;
const GREY = [0.35, 0.35, 0.35] as const;
const LINE = [0.8, 0.8, 0.8] as const;
const PARTIAL_FILL = [1, 0.95, 0.78] as const;

/** Letters outside WinAnsi (Helvetica's encoding) would make pdf-lib throw, so they become "?". */
function makeSafeText(font: PDFFont): (text: string) => string {
  const ok = new Map<string, boolean>();
  const encodable = (ch: string) => {
    let known = ok.get(ch);
    if (known === undefined) {
      try {
        font.encodeText(ch);
        known = true;
      } catch {
        known = false;
      }
      ok.set(ch, known);
    }
    return known;
  };
  return (text) =>
    Array.from(toWinAnsi(text.normalize('NFC')))
      .map((ch) => (encodable(ch) ? ch : '?'))
      .join('');
}

/** The merged grade chart as a one-page vector PDF (same model and renderer as the stats page). */
async function gradeChartPdf(stats: ExamStats, docTitle: string): Promise<Uint8Array> {
  const model = buildGradeChartModel(stats, { t: get(t), fmt: get(fmt) });
  const markup = renderChartSvg(
    {
      domain: 100,
      layers: model.layers,
      markers: model.markers,
      spans: model.spans,
      curve: model.curve,
      axisLabel: translate('stats.submissionHistogram.axisLabel'),
      ariaLabel: docTitle,
    },
    docTitle
  );
  return svgToPdfBytes(markup, docTitle);
}

export async function renderSummaryPdf(input: SummaryInput): Promise<Uint8Array> {
  const { exam, stats, totalMaxPoints, rows, submissionCount } = input;
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const safe = makeSafeText(regular);
  const title = exam.title || translate('dashboard.examList.untitledExam');
  pdf.setTitle(`${title} – ${translate('export.exam.summary.title')}`);
  pdf.setCreator('Examance');

  let page: PDFPage = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - PAGE.margin;

  const ensure = (height: number, onNewPage?: () => void) => {
    if (y - height >= PAGE.margin + 14) return;
    page = pdf.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - PAGE.margin;
    onNewPage?.();
  };
  const text = (value: string, x: number, size = 10, font = regular, color: readonly number[] = [0, 0, 0]) =>
    page.drawText(safe(value), { x, y, size, font, color: rgb(color[0], color[1], color[2]) });
  /** Text cut with an ellipsis so it never runs into the next column. */
  const fit = (value: string, width: number, size: number, font = regular) => {
    let s = safe(value);
    if (font.widthOfTextAtSize(s, size) <= width) return s;
    while (s.length > 1 && font.widthOfTextAtSize(`${s}...`, size) > width) s = s.slice(0, -1);
    return `${s}...`;
  };
  const heading = (value: string) => {
    ensure(40);
    y -= 26;
    text(value, PAGE.margin, 13, bold);
    y -= 6;
  };
  const rule = () =>
    page.drawLine({
      start: { x: PAGE.margin, y },
      end: { x: PAGE.width - PAGE.margin, y },
      thickness: 0.5,
      color: rgb(...LINE),
    });
  /** A table row: cells are left-aligned at the given x offsets. */
  const tableRow = (cells: string[], columns: { x: number; width: number }[], font = regular, fill?: readonly number[]) => {
    ensure(ROW_HEIGHT);
    if (fill) {
      page.drawRectangle({
        x: PAGE.margin,
        y: y - ROW_HEIGHT,
        width: CONTENT_WIDTH,
        height: ROW_HEIGHT,
        color: rgb(fill[0], fill[1], fill[2]),
      });
    }
    const top = y;
    y -= 12;
    cells.forEach((cell, i) => text(fit(cell, columns[i].width - 6, 9, font), PAGE.margin + columns[i].x, 9, font));
    y = top - ROW_HEIGHT;
  };

  // --- Title and metadata ------------------------------------------------------------------
  y -= 18;
  text(title, PAGE.margin, 20, bold);
  y -= 16;
  text(
    `${translate('export.exam.summary.title')} · ${translate('export.exam.summary.exportedAt', { date: formatDateTime(new Date()) })}`,
    PAGE.margin,
    9,
    regular,
    GREY
  );

  const keyValues = (pairs: [string, string][], columns = 2) => {
    const colWidth = CONTENT_WIDTH / columns;
    for (let i = 0; i < pairs.length; i += columns) {
      ensure(16);
      y -= 15;
      pairs.slice(i, i + columns).forEach(([k, v], c) => {
        const x = PAGE.margin + c * colWidth;
        text(`${safe(k)}:`, x, 9, regular, GREY);
        text(fit(v || '-', colWidth - 100, 10, bold), x + 90, 10, bold);
      });
    }
  };

  heading(translate('export.exam.summary.metadata'));
  keyValues([
    [translate('export.exam.summary.testart'), exam.testart ?? ''],
    [translate('export.exam.summary.course'), formatExamCourse(exam.grade, exam.klasse)],
    [translate('export.exam.summary.subject'), exam.fach ?? ''],
    [translate('export.exam.summary.date'), exam.datum ?? ''],
    [translate('export.exam.summary.teacher'), exam.lehrernachname ?? ''],
    [translate('export.exam.summary.nr'), exam.nr ?? ''],
    [translate('export.exam.summary.maxPoints'), totalMaxPoints === null ? '' : formatNumber(totalMaxPoints, { maximumFractionDigits: 2 })],
  ]);

  // --- Results at a glance -----------------------------------------------------------------
  const complete = stats.results.filter((r) => r.isComplete).length;
  const partial = stats.results.length - complete;
  const ungraded = Math.max(0, submissionCount - stats.results.length);
  const dash = '-';
  heading(translate('export.exam.summary.results'));
  keyValues([
    [translate('stats.cards.gradeAverage'), stats.gradeAverage === null ? dash : formatNumber(stats.gradeAverage, { maximumFractionDigits: 2 })],
    [translate('stats.cards.avgPercent'), stats.summary ? formatPercent(stats.summary.mean / 100, 1) : dash],
    [translate('stats.cards.passRate'), stats.passRate === null ? dash : formatPercent(stats.passRate, 0)],
    [translate('stats.cards.median'), stats.summary ? formatPercent(stats.summary.median / 100, 1) : dash],
    [translate('export.exam.summary.complete'), String(complete)],
    [translate('export.exam.summary.partial'), String(partial)],
    [translate('export.exam.summary.ungraded'), String(ungraded)],
  ]);

  // --- Grading key -------------------------------------------------------------------------
  heading(translate('export.exam.summary.gradingKey'));
  const keyColumns = [
    { x: 0, width: 60 },
    { x: 60, width: 200 },
    { x: 260, width: 110 },
    { x: 370, width: 110 },
  ];
  tableRow(
    [translate('export.exam.summary.grade'), translate('export.exam.summary.gradeLabel'), translate('export.exam.summary.minPercent'), translate('export.exam.summary.minPoints')],
    keyColumns,
    bold
  );
  rule();
  const cutoffs = [...effectiveGradingKey(exam.gradingKey).cutoffs].sort((a, b) => b.minPercentage - a.minPercentage);
  for (const cutoff of cutoffs) {
    const threshold = cutoffThreshold(cutoff.minPercentage);
    tableRow(
      [
        cutoff.grade,
        cutoff.label,
        formatPercent(threshold / 100, 2),
        totalMaxPoints === null ? dash : formatNumber(Math.round(totalMaxPoints * threshold) / 100, { maximumFractionDigits: 2 }),
      ],
      keyColumns
    );
  }

  // --- Chart -------------------------------------------------------------------------------
  if (stats.summary) {
    const [chart] = await pdf.embedPdf(await gradeChartPdf(stats, title));
    const height = (chart.height / chart.width) * CONTENT_WIDTH;
    ensure(height + 40);
    heading(translate('stats.combined.title'));
    y -= height + 4;
    page.drawPage(chart, { x: PAGE.margin, y, width: CONTENT_WIDTH, height });
  }

  // --- Student table -----------------------------------------------------------------------
  const columns = [
    { x: 0, width: 195 },
    { x: 195, width: 90 },
    { x: 285, width: 70 },
    { x: 355, width: 50 },
    { x: 405, width: CONTENT_WIDTH - 405 },
  ];
  const header = () => {
    tableRow(
      [
        translate('export.exam.summary.student'),
        translate('export.exam.summary.points'),
        translate('export.exam.summary.percent'),
        translate('export.exam.summary.grade'),
        translate('export.exam.summary.status'),
      ],
      columns,
      bold
    );
    rule();
  };
  heading(translate('export.exam.summary.students'));
  header();
  const maxText = totalMaxPoints === null ? '' : ` / ${formatNumber(totalMaxPoints, { maximumFractionDigits: 2 })}`;
  const byName = [...rows].sort((a, b) =>
    (a.studentName || a.fallbackCode).localeCompare(b.studentName || b.fallbackCode, undefined, { numeric: true })
  );
  for (const row of byName) {
    const graded = row.state !== 'ungraded';
    const status =
      row.state === 'partial' ? translate('stats.exportModal.provisional') : row.state === 'ungraded' ? translate('stats.exportModal.ungraded') : '';
    ensure(ROW_HEIGHT, header);
    tableRow(
      [
        row.studentName || row.fallbackCode || dash,
        graded ? `${formatNumber(Number(row.totalScore), { maximumFractionDigits: 2 })}${maxText}` : dash,
        graded ? formatPercent(Number(row.percentage) / 100, 1) : dash,
        graded ? row.grade : dash,
        status,
      ],
      columns,
      regular,
      row.state === 'partial' ? PARTIAL_FILL : undefined
    );
  }

  // Page numbers last, when the page count is known.
  const pages = pdf.getPages();
  pages.forEach((p, i) =>
    p.drawText(`${i + 1} / ${pages.length}`, { x: PAGE.width - PAGE.margin - 30, y: 22, size: 8, font: regular, color: rgb(...GREY) })
  );
  return pdf.save();
}
