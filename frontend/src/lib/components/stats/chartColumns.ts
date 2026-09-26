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
import type { TranslationKey, TranslationVars } from '$lib/i18n';

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
  /** Text above the bar; falls back to the bare count where it does not fit. */
  value: string;
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
  /**
   * Where the category labels go: `'axis'` puts one label per column
   * directly under the baseline; `'group'` puts a second row under the axis
   * row, centred under each column's whole slot — for a backdrop layer whose
   * columns span several foreground columns.
   */
  labels: 'axis' | 'group';
  /** Draw `value` above each non-empty bar. */
  values: boolean;
  /**
   * Draw columns as a light backdrop band (faint tint, a cap line at the
   * count, thin side borders) instead of solid bars — the merged chart's
   * grade layer, so the percentage bars in front stay the focus.
   */
  band?: boolean;
}

type Translate = (key: TranslationKey, vars?: TranslationVars) => string;
type Percent = (fraction: number, digits?: number) => string;
export type NumberFormat = (value: number) => string;

/** "N (P %)" — a count with its share of all graded submissions; the bare count when nothing is graded. */
function countWithShare(count: number, total: number, percent: Percent): string {
  return total > 0 ? `${count} (${percent(count / total, 0)})` : `${count}`;
}

/** One slot per grade, best grade on the left (the Notenspiegel convention). */
export function gradeColumns(
  buckets: GradeDistributionBucket[],
  t: Translate,
  percent: Percent
): ChartColumn[] {
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  return buckets.map((b, i) => {
    const from = t('stats.gradeDistribution.fromPercent', { percent: b.minPercentage });
    return {
      from: i,
      to: i + 1,
      count: b.count,
      provisional: b.provisionalCount,
      color: gradeColorVar(i, buckets.length),
      lines: [b.grade, b.label, from],
      value: b.count > 0 ? countWithShare(b.count, total, percent) : `${b.count}`,
      title: `${b.grade} ${b.label} (${from}): ${b.count}`,
    };
  });
}

/**
 * Each grade as a band over the percentage range it covers — the merged
 * chart's backdrop. `buckets` is best-first; a band's high end is the low
 * end of the band before it (100 % for the best grade), except the worst
 * band always reaches down to 0 % (everything below the lowest cutoff grades
 * as the worst row). Mirrored onto the same 100→0 axis as `binColumns`.
 * Labels match the grade chart: grade, grade label, and "N (P %)" — also
 * for empty grades, so a zero reads as zero rather than as missing data.
 */
export function gradeBands(
  buckets: GradeDistributionBucket[],
  num: NumberFormat,
  percent: Percent
): ChartColumn[] {
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const los = buckets.map((b, i) => (i === buckets.length - 1 ? 0 : clamp(b.minPercentage)));
  return buckets
    .map((b, i) => {
      const lo = los[i];
      const hi = clamp(i === 0 ? 100 : los[i - 1]);
      return {
        from: 100 - hi,
        to: 100 - lo,
        count: b.count,
        provisional: b.provisionalCount,
        color: gradeColorVar(i, buckets.length),
        lines: [b.grade, b.label, countWithShare(b.count, total, percent)],
        value: `${b.count}`,
        title: `${b.grade} ${b.label} (${num(lo)}–${num(hi)} %): ${b.count}`,
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
      lines: [`${num(b.binStart)}–${num(b.binEnd)}`],
      value: `${b.count}`,
      title: `${num(b.binStart)}–${num(b.binEnd)} %: ${b.count}`,
      anchor: b.startsGrade || b.binEnd === 100,
    }))
    .reverse();
}
