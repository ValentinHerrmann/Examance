/**
 * Column data for the stats charts. `ColumnChart` draws layers of these on a
 * shared domain; the builders below turn grade buckets and percentage bins
 * into columns, so the three charts differ only in which layers they stack.
 * Every chart reads best on the left, worst on the right: grade columns are
 * already best-first, and the percentage builders (`binColumns`,
 * `gradeBands`) mirror the 0–100 % axis so 100 % lands on the left too.
 */
import { gradeColorVar, type GradeDistributionBucket } from '$lib/analytics/gradingKey';
import type { PercentageHistogramBin } from '$lib/analytics/stats';

/**
 * One run of caption text. `dynamic` marks values that change while grading
 * continues (counts, shares); the chart colours them apart from static
 * labels (grades, grade names, percentage ranges).
 */
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
  /**
   * Draw columns as wide translucent bars, meant to sit behind a narrower
   * layer — the merged chart's grades. Their caption (`valueOptions`) goes
   * above each bar, even for a count of zero.
   */
  band?: boolean;
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
 * The percentage range each grade covers, as `[lo, hi]`. `buckets` is
 * best-first; a grade's high end is the low end of the grade before it
 * (100 % for the best grade), and the worst grade always reaches down to 0 %
 * (everything below the lowest cutoff grades as the worst row).
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
  percent: Percent
): ChartColumn[] {
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  const ranges = gradeRanges(buckets);
  return buckets.map((b, i) => {
    const range = rangeLabel(ranges[i], num);
    return {
      from: i,
      to: i + 1,
      count: b.count,
      provisional: b.provisionalCount,
      color: gradeColorVar(i, buckets.length),
      lines: [b.grade, b.label, range],
      value: b.count > 0 ? countWithShare(b.count, total, percent) : `${b.count}`,
      title: `${b.grade} ${b.label} (${range}): ${b.count}`,
    };
  });
}

/**
 * Each grade as a band over the percentage range it covers — the merged
 * chart's backdrop, mirrored onto the same 100→0 axis as `binColumns`.
 * The caption above each bar matches the grade chart — "2 Gut · 4 (67 %)",
 * with the grade static and the count dynamic, shortened step by step where
 * the bar is narrow — and is shown for empty grades too, so a zero reads as
 * zero rather than as missing data.
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

/**
 * Percentage histogram bins, mirrored so 100 % is on the left like every
 * other chart. `bins` arrives ascending (0 → 100); the returned array is the
 * reverse, left-to-right, and the input is never mutated.
 */
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
