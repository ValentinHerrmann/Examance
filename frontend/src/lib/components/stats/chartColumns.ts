/**
 * Column data for the stats charts. `ColumnChart` draws layers of these on a
 * shared domain; the builders below turn grade buckets and percentage bins
 * into columns, so the three charts differ only in which layers they stack.
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
}

export interface ChartLayer {
  columns: ChartColumn[];
  /** Share of each column's slot the bar fills. */
  fill: number;
  opacity?: number;
  /** Where the category labels go: under the axis, or in a band above the plot. */
  labels: 'axis' | 'top';
  /** Draw `value` above each non-empty bar. */
  values: boolean;
}

type Translate = (key: TranslationKey, vars?: TranslationVars) => string;
type Percent = (fraction: number, digits?: number) => string;

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
      value: total > 0 && b.count > 0 ? `${b.count} (${percent(b.count / total, 0)})` : `${b.count}`,
      title: `${b.grade} ${b.label} (${from}): ${b.count}`,
    };
  });
}

/** Each grade as a band over the percentage range it covers — the merged chart's backdrop. */
export function gradeBands(buckets: GradeDistributionBucket[]): ChartColumn[] {
  return buckets
    .map((b, i) => ({
      from: b.minPercentage,
      to: i === 0 ? 100 : buckets[i - 1].minPercentage,
      count: b.count,
      provisional: b.provisionalCount,
      color: gradeColorVar(i, buckets.length),
      lines: [b.grade, `${b.count}×`],
      value: `${b.count}`,
      title: `${b.grade} ${b.label} (${b.minPercentage}–${i === 0 ? 100 : buckets[i - 1].minPercentage} %): ${b.count}`,
    }))
    .filter((c) => c.to > c.from);
}

export function binColumns(bins: PercentageHistogramBin[]): ChartColumn[] {
  return bins.map((b) => ({
    from: b.binStart,
    to: b.binEnd,
    count: b.count,
    provisional: b.provisionalCount,
    color: b.colorVar,
    lines: [`${b.binStart}–${b.binEnd}`],
    value: `${b.count}`,
    title: `${b.binStart}–${b.binEnd} %: ${b.count}`,
  }));
}
