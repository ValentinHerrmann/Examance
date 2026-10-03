<script lang="ts">
  import { t, type TranslationKey } from '$lib/i18n';
  import { fmt } from '$lib/utils/format';
  import type { ExamRecord } from '$lib/db/schema';
  import type { ExamStats } from '$lib/analytics/stats';
  import { PageShell, PageHeader, Button, Card } from '$lib/components/ui';
  import StatsCards from './StatsCards.svelte';
  import BorderlineCases from './BorderlineCases.svelte';
  import ChartCard from './ChartCard.svelte';
  import { binColumns, gradeBands, gradeColumns, normalCurve, type ChartCurve, type ChartLayer, type ChartMarker, type ChartSpan } from './chartColumns';
  import StatsExportModal from './StatsExportModal.svelte';

  export let exam: ExamRecord | null;
  export let stats: ExamStats | null;
  export let totalMaxPoints: number | null;
  export let submissionCount: number;
  /** Submission ids in grading-view order, for the borderline list's links. */
  export let submissionIds: string[];
  export let showConfirmModal: boolean;
  export let onOpenExport: () => void;
  export let onConfirmExport: () => void;
  export let onCancelExport: () => void;

  const PRESETS: Record<string, TranslationKey> = {
    linear_50: 'stats.gradeDistribution.presets.linear50',
    linear_40: 'stats.gradeDistribution.presets.linear40',
    even_split: 'stats.gradeDistribution.presets.evenSplit',
  };
  let preset: TranslationKey;
  $: preset = exam?.gradingKey
    ? (PRESETS[exam.gradingKey.preset] ?? 'stats.gradeDistribution.presets.custom')
    : 'stats.gradeDistribution.presets.standard';

  $: num = (v: number) => $fmt.number(v, { maximumFractionDigits: 2 });
  $: grades = gradeColumns(stats?.gradeBuckets ?? [], num, $fmt.percent, stats?.borderline ?? []);
  $: bins = binColumns(stats?.bins ?? [], num);
  $: bands = gradeBands(stats?.gradeBuckets ?? [], num, $fmt.percent);
  let combinedLayers: ChartLayer[];
  $: combinedLayers = [
    { columns: bands, fill: 1, labels: 'none', values: true, band: true },
    { columns: bins, fill: 0.7, labels: 'axis', values: true },
  ];
  // Mean and median as marks on the merged chart's summary strip, whose axis runs 100 % → 0 %
  // (domain = 100 - percentage). The ± standard deviation span is there for evaluation.
  $: pctText = (p: number) => $fmt.percent(p / 100, 1);
  $: one = (v: number) => $fmt.number(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  let combinedMarkers: ChartMarker[];
  $: combinedMarkers = stats?.summary
    ? [
        {
          at: 100 - stats.summary.mean,
          caption: [{ text: `${$t('stats.combined.markers.mean')} ` }, { text: pctText(stats.summary.mean), dynamic: true }],
          title: `${$t('stats.combined.markers.meanTitle')}: ${pctText(stats.summary.mean)}`,
        },
        {
          at: 100 - stats.summary.median,
          shape: 'diamond',
          caption: [{ text: `${$t('stats.combined.markers.median')} ` }, { text: pctText(stats.summary.median), dynamic: true }],
          title: `${$t('stats.combined.markers.medianTitle')}: ${pctText(stats.summary.median)}`,
        },
      ]
    : [];
  // Upper bound first, like every range on the page ("76–52 %").
  $: sdRange = stats?.summary
    ? `${one(Math.min(100, stats.summary.mean + stats.summary.stdDev))}–${one(Math.max(0, stats.summary.mean - stats.summary.stdDev))}\u00a0%`
    : '';
  let combinedSpans: ChartSpan[];
  $: combinedSpans =
    stats?.summary && stats.summary.stdDev > 0
      ? [
          {
            from: 100 - (stats.summary.mean + stats.summary.stdDev),
            to: 100 - (stats.summary.mean - stats.summary.stdDev),
            captionOptions: [
              [{ text: `${$t('stats.combined.markers.sdLabel')}: ` }, { text: sdRange, dynamic: true }],
              [{ text: `${$t('stats.combined.markers.sdShort')}: ` }, { text: sdRange, dynamic: true }],
              [{ text: sdRange, dynamic: true }],
            ],
            title: $t('stats.combined.markers.sdTitle', {
              sd: pctText(stats.summary.stdDev),
              from: pctText(Math.max(0, stats.summary.mean - stats.summary.stdDev)),
              to: pctText(Math.min(100, stats.summary.mean + stats.summary.stdDev)),
            }),
          },
        ]
      : [];
  // Uneven bins (binWidth null) are at most 5 % wide, so scale the curve to 5 %.
  let combinedCurve: ChartCurve | null;
  $: combinedCurve = stats?.summary
    ? {
        points: normalCurve(stats.summary.mean, stats.summary.stdDev, stats.results.length, stats.binWidth ?? 5),
        title: $t('stats.combined.markers.curveTitle'),
      }
    : null;
  $: provisional = (stats?.results ?? []).some((r) => !r.isComplete);
  $: histogramSubtitle = stats
    ? stats.binWidth === null
      ? $t('stats.submissionHistogram.subtitleUneven')
      : $t('stats.submissionHistogram.subtitle', { step: num(stats.binWidth) })
    : '';

  $: graded = stats?.results.length ?? 0;
  $: full = stats?.results.filter((r) => r.isComplete).length ?? 0;
</script>

<PageShell width="full">
  <PageHeader title={$t('stats.page.title')} />

  {#if submissionCount > 0}
    <div class="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
      <span>{$t('stats.page.statusBanner', { graded, total: submissionCount })}</span>
      {#if graded > full}
        <span class="text-warning-fg">
          {$t('stats.page.partialIndicator', { partial: graded - full, full })}
        </span>
      {/if}
      {#if submissionCount > graded}
        <span class="text-muted">
          {$t('stats.page.pendingIndicator', { pending: submissionCount - graded })}
        </span>
      {/if}
    </div>
  {/if}

  {#if stats?.summary}
    <StatsCards {stats} {totalMaxPoints} gradingKey={exam?.gradingKey} />
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard
        class="lg:col-span-2"
        title={$t('stats.combined.title')}
        subtitle={$t('stats.combined.subtitle')}
        domain={100}
        plotHeight={260}
        layers={combinedLayers}
        markers={combinedMarkers}
        spans={combinedSpans}
        curve={combinedCurve}
        axisLabel={$t('stats.submissionHistogram.axisLabel')}
        examTitle={exam?.title ?? ''}
        fileName="noten_prozentverteilung"
      >
        {#if combinedMarkers.length}
          <p class="mt-2 text-xs text-muted">{$t('stats.combined.markers.legend')}</p>
        {/if}
      </ChartCard>
      <BorderlineCases class="lg:col-span-2" cases={stats.borderline} examId={exam?.id ?? ''} {submissionIds} />
      <ChartCard
        title={$t('stats.gradeDistribution.title')}
        subtitle="{$t('stats.gradeDistribution.gradingKeyPrefix')} {$t(preset)}"
        domain={grades.length}
        layers={[{ columns: grades, fill: 0.72, labels: 'axis', values: true }]}
        axisLabel={$t('stats.gradeDistribution.axisLabel')}
        examTitle={exam?.title ?? ''}
        fileName="notenverteilung"
      >
        {#if stats.borderline.length > 0}
          <p class="mt-2 text-xs text-muted">{$t('stats.gradeDistribution.borderlineLegend')}</p>
        {/if}
      </ChartCard>
      <ChartCard
        title={$t('stats.submissionHistogram.title')}
        subtitle={histogramSubtitle}
        domain={100}
        layers={[{ columns: bins, fill: 0.72, labels: 'axis', values: true }]}
        axisLabel={$t('stats.submissionHistogram.axisLabel')}
        examTitle={exam?.title ?? ''}
        fileName="prozentverteilung"
      />
    </div>
    {#if provisional}
      <p class="mt-2 flex items-center gap-2 text-xs text-muted">
        <span class="inline-block h-2 w-4 rounded-sm bg-content opacity-70"></span>
        {$t('stats.gradeDistribution.provisionalLegend')}
      </p>
    {/if}
  {:else}
    <Card class="text-sm text-muted">{$t('stats.page.emptyStats')}</Card>
  {/if}

  <div class="mt-6">
    <Button variant="secondary" onClick={onOpenExport}>
      {$t('stats.page.exportButton')}
    </Button>
  </div>
</PageShell>

{#if showConfirmModal}
  <StatsExportModal onConfirm={onConfirmExport} onCancel={onCancelExport} />
{/if}
