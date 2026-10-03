/**
 * Column data for the stats charts: `ColumnChart` draws layers of these on a shared domain.
 * Every chart reads best-left: grade columns are already best-first, and percentage builders
 * (`binColumns`, `gradeBands`) mirror the 0-100 % axis so 100 % is on the left.
 */
import { gradeColorVar, type BorderlineCase, type GradeDistributionBucket } from '$lib/analytics/gradingKey';
import type { PercentageHistogramBin } from '$lib/analytics/stats';

/** One run of caption text; `dynamic` values (counts, shares) change while grading continues and are coloured apart from static labels. */
export interface CaptionPart {
  text: string;
  dynamic?: boolean;
}
export type Caption = CaptionPart[];

export interface ChartColumn {
  /** Extent on the chart's domain (grade slots, or 0–100 %). */
  from: number;
  to: number;
  count: number;
  /** Subset of `count` that is not fully graded yet; drawn lighter on top. */
  provisional: number;
  color: string;
  /** Category label, one entry per line; rotated labels use the first two. */
  lines: string[];
  /** Text above the bar (a dynamic value); falls back to the bare count where it does not fit. */
  value: string;
  /** Caption candidates, longest first; the chart shows the first that fits (overrides `value`). */
  valueOptions?: Caption[];
  /** Hover tooltip. */
  title: string;
  /** Keeps its axis label when crowded labels are thinned. */
  anchor?: boolean;
  /** Borderline counts, marked as zones inside the bar: `plus` at its top, `minus` at its foot. */
  marks?: { plus: number; minus: number };
}

export interface ChartLayer {
  columns: ChartColumn[];
  /** Share of each column's slot the bar fills. */
  fill: number;
  opacity?: number;
  /** `'axis'`: one label per column directly under the baseline; `'none'`: no category labels. */
  labels: 'axis' | 'none';
  /** Draw `value` above each non-empty bar. */
  values: boolean;
  /** Draw as wide translucent bars behind a narrower layer (merged chart's grades); the caption goes above each bar, even at zero. */
  band?: boolean;
}

/** A mark on the summary strip above the plot (mean, median), labelled below it. */
export interface ChartMarker {
  /** Position on the chart's domain. */
  at: number;
  caption: Caption;
  /** `'dot'` (filled, default) or `'diamond'` (outlined). */
  shape?: 'dot' | 'diamond';
  title: string;
}

/** A stretch of the domain (mean ± standard deviation), drawn as a labelled bracket on the summary strip. */
export interface ChartSpan {
  from: number;
  to: number;
  /** Label above the bracket, longest first; the first that fits the span's width is shown. */
  captionOptions: Caption[];
  title: string;
}

/** A reference curve behind the bars, as points on the domain (x) and count axis (y). */
export interface ChartCurve {
  points: [number, number][];
  title: string;
}

/**
 * Normal distribution with the class mean/stddev scaled to the histogram (students per bin =
 * count × bin width × density), on the mirrored axis (x = 100 − percentage). Empty without spread.
 */
export function normalCurve(mean: number, sd: number, count: number, binWidth: number): [number, number][] {
  if (!(sd > 0) || count === 0) return [];
  const scale = (count * binWidth) / (sd * Math.sqrt(2 * Math.PI));
  return Array.from({ length: 201 }, (_, i) => {
    const p = i / 2;
    return [100 - p, scale * Math.exp(-0.5 * ((p - mean) / sd) ** 2)];
  });
}

// Separator before a dynamic run; the trailing no-break space survives SVG whitespace collapsing.
const SEP = ' ·\u00a0';

type Percent = (fraction: number, digits?: number) => string;
export type NumberFormat = (value: number) => string;

/** "N (P %)" — a count with its share of all graded submissions; the bare count when nothing is graded. */
function countWithShare(count: number, total: number, percent: Percent): string {
  return total > 0 ? `${count} (${percent(count / total, 0)})` : `${count}`;
}

/**
 * Percentage range `[lo, hi]` each grade covers. `buckets` is best-first; a grade's high end is
 * the previous grade's low end (100 % for the best) and the worst grade reaches down to 0 %.
 */
function gradeRanges(buckets: GradeDistributionBucket[]): [number, number][] {
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const los = buckets.map((b, i) => (i === buckets.length - 1 ? 0 : clamp(b.minPercentage)));
  return los.map((lo, i) => [lo, clamp(i === 0 ? 100 : los[i - 1])]);
}

/** "100–85 %": upper bound first, matching the axes that run from 100 % down. */
function rangeLabel([lo, hi]: [number, number], num: NumberFormat): string {
  return `${num(hi)}–${num(lo)} %`;
}

/** One slot per grade, best grade on the left (the Notenspiegel convention). */
export function gradeColumns(
  buckets: GradeDistributionBucket[],
  num: NumberFormat,
  percent: Percent,
  borderline: BorderlineCase[] = []
): ChartColumn[] {
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  const ranges = gradeRanges(buckets);
  return buckets.map((b, i) => {
    const range = rangeLabel(ranges[i], num);
    const plus = borderline.filter((c) => c.gradeIndex === i && c.side === '+').length;
    const minus = borderline.filter((c) => c.gradeIndex === i && c.side === '-').length;
    return {
      marks: { plus, minus },
      from: i,
      to: i + 1,
      count: b.count,
      provisional: b.provisionalCount,
      color: gradeColorVar(i, buckets.length),
      lines: [b.grade, b.label, range],
      value: b.count > 0 ? countWithShare(b.count, total, percent) : `${b.count}`,
      title: `${b.grade} ${b.label} (${range}): ${b.count}` + (plus || minus ? ` (+${plus} / −${minus})` : ''),
    };
  });
}

/**
 * Each grade as a band over its percentage range: the merged chart's backdrop, mirrored onto the
 * 100→0 axis. Captions match the grade chart and show for empty grades too, so zero reads as zero.
 */
export function gradeBands(
  buckets: GradeDistributionBucket[],
  num: NumberFormat,
  percent: Percent
): ChartColumn[] {
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  const ranges = gradeRanges(buckets);
  return buckets
    .map((b, i) => {
      const [lo, hi] = ranges[i];
      const share = countWithShare(b.count, total, percent);
      return {
        from: 100 - hi,
        to: 100 - lo,
        count: b.count,
        provisional: b.provisionalCount,
        color: gradeColorVar(i, buckets.length),
        lines: [b.grade, b.label],
        value: `${b.count}`,
        valueOptions: [
          [{ text: `${b.grade} ${b.label}${SEP}` }, { text: share, dynamic: true }],
          [{ text: `${b.grade}${SEP}` }, { text: share, dynamic: true }],
          [{ text: `${b.grade}${SEP}` }, { text: `${b.count}`, dynamic: true }],
          [{ text: b.grade }],
        ],
        title: `${b.grade} ${b.label} (${rangeLabel([lo, hi], num)}): ${b.count}`,
      };
    })
    .filter((c) => c.to > c.from);
}

/** Percentage histogram bins mirrored so 100 % is on the left; `bins` arrives ascending and is not mutated. */
export function binColumns(bins: PercentageHistogramBin[], num: NumberFormat): ChartColumn[] {
  return bins
    .map((b) => ({
      from: 100 - b.binEnd,
      to: 100 - b.binStart,
      count: b.count,
      provisional: b.provisionalCount,
      color: b.colorVar,
      // Upper bound first: the axis runs from 100 % down, so "100–95" reads in axis order.
      lines: [`${num(b.binEnd)}–${num(b.binStart)}`],
      value: `${b.count}`,
      title: `${num(b.binEnd)}–${num(b.binStart)} %: ${b.count}`,
      anchor: b.startsGrade || b.binEnd === 100,
    }))
    .reverse();
}
