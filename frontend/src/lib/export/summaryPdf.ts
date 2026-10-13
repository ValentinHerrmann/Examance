/** One-document overview of an exam's results for the raw export: metadata, grading key, statistics, chart and student table. */
import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';
import { get } from 'svelte/store';
import type { GradeRow, GradingState } from '#lib/analytics/examResults';
import { buildGradeChartModel } from '#lib/analytics/gradeChartModel';
import { cutoffThreshold, effectiveGradingKey } from '#lib/analytics/gradingKey';
import type { ExamStats } from '#lib/analytics/stats';
import { svgToPdfBytes, toWinAnsi } from '#lib/components/stats/chartExport';
import { renderChartSvg } from '#lib/components/stats/renderChart';
import type { ExamRecord } from '#lib/db/schema';
import { t, translate } from '#lib/i18n';
import type { TranslationKey } from '#lib/i18n/types';
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

type PdfLib = typeof import('pdf-lib');
type Rgb = readonly number[];
interface Column {
  x: number;
  width: number;
}

const DASH = '-';
const BLACK: Rgb = [0, 0, 0];
const TWO_DECIMALS = { maximumFractionDigits: 2 };

/** Status column text per grading state; complete rows stay blank. */
const STATUS_LABEL_KEY: Record<GradingState, TranslationKey | null> = {
  complete: null,
  partial: 'stats.exportModal.provisional',
  ungraded: 'stats.exportModal.ungraded',
};

/** Drawing cursor: owns the current page and y so sections just say what to draw. */
class SummaryDoc {
  page: PDFPage;
  y = PAGE.height - PAGE.margin;

  constructor(
    readonly pdf: PDFDocument,
    private readonly lib: PdfLib,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
    private readonly safe: (text: string) => string
  ) {
    this.page = pdf.addPage([PAGE.width, PAGE.height]);
  }

  static async create(title: string): Promise<SummaryDoc> {
    const lib = await import('pdf-lib');
    const pdf = await lib.PDFDocument.create();
    const regular = await pdf.embedFont(lib.StandardFonts.Helvetica);
    const bold = await pdf.embedFont(lib.StandardFonts.HelveticaBold);
    pdf.setTitle(`${title} – ${translate('export.exam.summary.title')}`);
    pdf.setCreator('Examance');
    return new SummaryDoc(pdf, lib, regular, bold, makeSafeText(regular));
  }

  private color(c: Rgb) {
    return this.lib.rgb(c[0], c[1], c[2]);
  }

  ensure(height: number, onNewPage?: () => void) {
    if (this.y - height >= PAGE.margin + 14) return;
    this.page = this.pdf.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
    onNewPage?.();
  }

  text(value: string, x: number, size = 10, font = this.regular, color: Rgb = BLACK) {
    this.page.drawText(this.safe(value), { x, y: this.y, size, font, color: this.color(color) });
  }

  /** Text cut with an ellipsis so it never runs into the next column. */
  fit(value: string, width: number, size: number, font = this.regular) {
    let s = this.safe(value);
    if (font.widthOfTextAtSize(s, size) <= width) return s;
    while (s.length > 1 && font.widthOfTextAtSize(`${s}...`, size) > width) s = s.slice(0, -1);
    return `${s}...`;
  }

  heading(value: string) {
    this.ensure(40);
    this.y -= 26;
    this.text(value, PAGE.margin, 13, this.bold);
    this.y -= 6;
  }

  rule() {
    this.page.drawLine({
      start: { x: PAGE.margin, y: this.y },
      end: { x: PAGE.width - PAGE.margin, y: this.y },
      thickness: 0.5,
      color: this.color(LINE),
    });
  }

  /** A table row: cells are left-aligned at the given x offsets. */
  tableRow(cells: string[], columns: Column[], font = this.regular, fill?: Rgb) {
    this.ensure(ROW_HEIGHT);
    if (fill) {
      this.page.drawRectangle({
        x: PAGE.margin,
        y: this.y - ROW_HEIGHT,
        width: CONTENT_WIDTH,
        height: ROW_HEIGHT,
        color: this.color(fill),
      });
    }
    const top = this.y;
    this.y -= 12;
    for (const [i, cell] of cells.entries()) {
      this.text(this.fit(cell, columns[i].width - 6, 9, font), PAGE.margin + columns[i].x, 9, font);
    }
    this.y = top - ROW_HEIGHT;
  }

  keyValues(pairs: [string, string][], columns = 2) {
    const colWidth = CONTENT_WIDTH / columns;
    for (let i = 0; i < pairs.length; i += columns) {
      this.ensure(16);
      this.y -= 15;
      for (const [c, [k, v]] of pairs.slice(i, i + columns).entries()) {
        const x = PAGE.margin + c * colWidth;
        this.text(`${this.safe(k)}:`, x, 9, this.regular, GREY);
        this.text(this.fit(v || DASH, colWidth - 100, 10, this.bold), x + 90, 10, this.bold);
      }
    }
  }

  /** Page numbers last, when the page count is known. */
  drawPageNumbers() {
    const pages = this.pdf.getPages();
    for (const [i, p] of pages.entries()) {
      p.drawText(`${i + 1} / ${pages.length}`, { x: PAGE.width - PAGE.margin - 30, y: 22, size: 8, font: this.regular, color: this.color(GREY) });
    }
  }
}

function drawTitle(doc: SummaryDoc, title: string) {
  doc.y -= 18;
  doc.text(title, PAGE.margin, 20, doc.bold);
  doc.y -= 16;
  const exportedAt = translate('export.exam.summary.exportedAt', { date: formatDateTime(new Date()) });
  doc.text(`${translate('export.exam.summary.title')} · ${exportedAt}`, PAGE.margin, 9, doc.regular, GREY);
}

function drawMetadata(doc: SummaryDoc, { exam, totalMaxPoints }: SummaryInput) {
  doc.heading(translate('export.exam.summary.metadata'));
  doc.keyValues([
    [translate('export.exam.summary.testart'), exam.testart ?? ''],
    [translate('export.exam.summary.course'), formatExamCourse(exam.grade, exam.klasse)],
    [translate('export.exam.summary.subject'), exam.fach ?? ''],
    [translate('export.exam.summary.date'), exam.datum ?? ''],
    [translate('export.exam.summary.teacher'), exam.lehrernachname ?? ''],
    [translate('export.exam.summary.nr'), exam.nr ?? ''],
    [translate('export.exam.summary.maxPoints'), totalMaxPoints === null ? '' : formatNumber(totalMaxPoints, TWO_DECIMALS)],
  ]);
}

function drawResults(doc: SummaryDoc, { stats, submissionCount }: SummaryInput) {
  const complete = stats.results.filter((r) => r.isComplete).length;
  const partial = stats.results.length - complete;
  const ungraded = Math.max(0, submissionCount - stats.results.length);
  doc.heading(translate('export.exam.summary.results'));
  doc.keyValues([
    [translate('stats.cards.gradeAverage'), stats.gradeAverage === null ? DASH : formatNumber(stats.gradeAverage, TWO_DECIMALS)],
    [translate('stats.cards.avgPercent'), stats.summary ? formatPercent(stats.summary.mean / 100, 1) : DASH],
    [translate('stats.cards.passRate'), stats.passRate === null ? DASH : formatPercent(stats.passRate, 0)],
    [translate('stats.cards.median'), stats.summary ? formatPercent(stats.summary.median / 100, 1) : DASH],
    [translate('export.exam.summary.complete'), String(complete)],
    [translate('export.exam.summary.partial'), String(partial)],
    [translate('export.exam.summary.ungraded'), String(ungraded)],
  ]);
}

function drawGradingKey(doc: SummaryDoc, { exam, totalMaxPoints }: SummaryInput) {
  doc.heading(translate('export.exam.summary.gradingKey'));
  const columns = [
    { x: 0, width: 60 },
    { x: 60, width: 200 },
    { x: 260, width: 110 },
    { x: 370, width: 110 },
  ];
  doc.tableRow(
    [translate('export.exam.summary.grade'), translate('export.exam.summary.gradeLabel'), translate('export.exam.summary.minPercent'), translate('export.exam.summary.minPoints')],
    columns,
    doc.bold
  );
  doc.rule();
  const cutoffs = [...effectiveGradingKey(exam.gradingKey).cutoffs].sort((a, b) => b.minPercentage - a.minPercentage);
  for (const cutoff of cutoffs) {
    const threshold = cutoffThreshold(cutoff.minPercentage);
    const minPoints = totalMaxPoints === null ? DASH : formatNumber(Math.round(totalMaxPoints * threshold) / 100, TWO_DECIMALS);
    doc.tableRow([cutoff.grade, cutoff.label, formatPercent(threshold / 100, 2), minPoints], columns);
  }
}

async function drawChart(doc: SummaryDoc, stats: ExamStats, title: string) {
  const [chart] = await doc.pdf.embedPdf(await gradeChartPdf(stats, title));
  const height = (chart.height / chart.width) * CONTENT_WIDTH;
  doc.ensure(height + 40);
  doc.heading(translate('stats.combined.title'));
  doc.y -= height + 4;
  doc.page.drawPage(chart, { x: PAGE.margin, y: doc.y, width: CONTENT_WIDTH, height });
}

function studentCells(row: GradeRow, maxText: string): string[] {
  const graded = row.state !== 'ungraded';
  const statusKey = STATUS_LABEL_KEY[row.state];
  return [
    row.studentName || row.fallbackCode || DASH,
    graded ? `${formatNumber(Number(row.totalScore), TWO_DECIMALS)}${maxText}` : DASH,
    graded ? formatPercent(Number(row.percentage) / 100, 1) : DASH,
    graded ? row.grade : DASH,
    statusKey ? translate(statusKey) : '',
  ];
}

function drawStudents(doc: SummaryDoc, { rows, totalMaxPoints }: SummaryInput) {
  const columns = [
    { x: 0, width: 195 },
    { x: 195, width: 90 },
    { x: 285, width: 70 },
    { x: 355, width: 50 },
    { x: 405, width: CONTENT_WIDTH - 405 },
  ];
  const header = () => {
    doc.tableRow(
      [
        translate('export.exam.summary.student'),
        translate('export.exam.summary.points'),
        translate('export.exam.summary.percent'),
        translate('export.exam.summary.grade'),
        translate('export.exam.summary.status'),
      ],
      columns,
      doc.bold
    );
    doc.rule();
  };
  doc.heading(translate('export.exam.summary.students'));
  header();
  const maxText = totalMaxPoints === null ? '' : ` / ${formatNumber(totalMaxPoints, TWO_DECIMALS)}`;
  const byName = [...rows].sort((a, b) =>
    (a.studentName || a.fallbackCode).localeCompare(b.studentName || b.fallbackCode, undefined, { numeric: true })
  );
  for (const row of byName) {
    doc.ensure(ROW_HEIGHT, header);
    doc.tableRow(studentCells(row, maxText), columns, doc.regular, row.state === 'partial' ? PARTIAL_FILL : undefined);
  }
}

export async function renderSummaryPdf(input: SummaryInput): Promise<Uint8Array> {
  const title = input.exam.title || translate('dashboard.examList.untitledExam');
  const doc = await SummaryDoc.create(title);
  drawTitle(doc, title);
  drawMetadata(doc, input);
  drawResults(doc, input);
  drawGradingKey(doc, input);
  if (input.stats.summary) await drawChart(doc, input.stats, title);
  drawStudents(doc, input);
  doc.drawPageNumbers();
  return doc.pdf.save();
}
