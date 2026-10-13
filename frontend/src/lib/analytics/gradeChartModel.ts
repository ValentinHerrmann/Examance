/** Layers, markers and curve of the stats page's merged "Notenverteilung + Prozentverteilung" chart, shared with the summary PDF. */
import type { ExamStats } from './stats';
import {
  binColumns,
  gradeBands,
  normalCurve,
  type ChartCurve,
  type ChartLayer,
  type ChartMarker,
  type ChartSpan,
} from '#lib/components/stats/chartColumns';
import type { TranslationKey, TranslationVars } from '#lib/i18n';
import type { Readable } from 'svelte/store';
import type { fmt } from '#lib/utils/format';

/** `$t` and `$fmt` of the caller, so a `$derived` on the stats page re-runs when the language changes. */
export interface GradeChartText {
  t: (key: TranslationKey, vars?: TranslationVars) => string;
  fmt: typeof fmt extends Readable<infer F> ? F : never;
}

export interface GradeChartModel {
  layers: ChartLayer[];
  markers: ChartMarker[];
  spans: ChartSpan[];
  curve: ChartCurve | null;
}

/** Mean/median marks sit on the summary strip, whose axis runs 100 % → 0 % (domain = 100 - percentage). */
export function buildGradeChartModel(stats: ExamStats | null, { t, fmt: f }: GradeChartText): GradeChartModel {
  const num = (v: number) => f.number(v, { maximumFractionDigits: 2 });
  const percent = f.percent;
  const pctText = (p: number) => percent(p / 100, 1);
  const one = (v: number) => f.number(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const buckets = stats?.gradeBuckets ?? [];
  const layers: ChartLayer[] = [
    { columns: gradeBands(buckets, num, percent), fill: 1, labels: 'none', values: true, band: true },
    { columns: binColumns(stats?.bins ?? [], num), fill: 0.7, labels: 'axis', values: true },
  ];
  const summary = stats?.summary;
  if (!stats || !summary) return { layers, markers: [], spans: [], curve: null };

  const markers: ChartMarker[] = [
    {
      at: 100 - summary.mean,
      caption: [{ text: `${t('stats.combined.markers.mean')} ` }, { text: pctText(summary.mean), dynamic: true }],
      title: `${t('stats.combined.markers.meanTitle')}: ${pctText(summary.mean)}`,
    },
    {
      at: 100 - summary.median,
      shape: 'diamond',
      caption: [{ text: `${t('stats.combined.markers.median')} ` }, { text: pctText(summary.median), dynamic: true }],
      title: `${t('stats.combined.markers.medianTitle')}: ${pctText(summary.median)}`,
    },
  ];

  // Upper bound first, like every range on the page ("76–52 %").
  const hi = Math.min(100, summary.mean + summary.stdDev);
  const lo = Math.max(0, summary.mean - summary.stdDev);
  const sdRange = `${one(hi)}–${one(lo)}\u00a0%`;
  const spans: ChartSpan[] =
    summary.stdDev > 0
      ? [
          {
            from: 100 - (summary.mean + summary.stdDev),
            to: 100 - (summary.mean - summary.stdDev),
            captionOptions: [
              [{ text: `${t('stats.combined.markers.sdLabel')}: ` }, { text: sdRange, dynamic: true }],
              [{ text: `${t('stats.combined.markers.sdShort')}: ` }, { text: sdRange, dynamic: true }],
              [{ text: sdRange, dynamic: true }],
            ],
            title: t('stats.combined.markers.sdTitle', {
              sd: pctText(summary.stdDev),
              from: pctText(lo),
              to: pctText(hi),
            }),
          },
        ]
      : [];

  // Uneven bins (binWidth null) are at most 5 % wide, so scale the curve to 5 %.
  const curve: ChartCurve = {
    points: normalCurve(summary.mean, summary.stdDev, stats.results.length, stats.binWidth ?? 5),
    title: t('stats.combined.markers.curveTitle'),
  };
  return { layers, markers, spans, curve };
}
