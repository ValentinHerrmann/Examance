<script lang="ts">
  import { t, type TranslationKey } from '#lib/i18n';
  import { fmt } from '#lib/utils/format';
  import type { ExamRecord } from '#lib/db/schema';
  import type { ExamStats } from '#lib/analytics/stats';
  import { PageShell, PageHeader, Button, Card } from '#lib/components/ui';
  import StatsCards from './StatsCards.svelte';
  import BorderlineCases from './BorderlineCases.svelte';
  import ChartCard from './ChartCard.svelte';
  import { binColumns, gradeColumns } from './chartColumns';
  import { buildGradeChartModel } from '#lib/analytics/gradeChartModel';
  import StatsExportModal from './StatsExportModal.svelte';

  interface Props {
    exam: ExamRecord | null;
    stats: ExamStats | null;
    totalMaxPoints: number | null;
    submissionCount: number;
    /** Submission ids in grading-view order, for the borderline list's links. */
    submissionIds: string[];
    showConfirmModal: boolean;
    onOpenExport: () => void;
    onConfirmExport: () => void;
    onCancelExport: () => void;
  }

  let {
    exam,
    stats,
    totalMaxPoints,
    submissionCount,
    submissionIds,
    showConfirmModal,
    onOpenExport,
    onConfirmExport,
    onCancelExport
  }: Props = $props();

  const PRESETS: Record<string, TranslationKey> = {
    linear_50: 'stats.gradeDistribution.presets.linear50',
    linear_40: 'stats.gradeDistribution.presets.linear40',
    even_split: 'stats.gradeDistribution.presets.evenSplit',
  };
  let preset: TranslationKey = $derived(exam?.gradingKey
    ? (PRESETS[exam.gradingKey.preset] ?? 'stats.gradeDistribution.presets.custom')
    : 'stats.gradeDistribution.presets.standard');

  const num = (v: number) => $fmt.number(v, { maximumFractionDigits: 2 });
  let grades = $derived(gradeColumns(stats?.gradeBuckets ?? [], num, $fmt.percent, stats?.borderline ?? []));
  let bins = $derived(binColumns(stats?.bins ?? [], num));
  let combined = $derived(buildGradeChartModel(stats, { t: $t, fmt: $fmt }));

  let provisional = $derived((stats?.results ?? []).some((r) => !r.isComplete));
  let histogramSubtitle = $derived(stats
    ? stats.binWidth === null
      ? $t('stats.submissionHistogram.subtitleUneven')
      : $t('stats.submissionHistogram.subtitle', { step: num(stats.binWidth) })
    : '');

  let graded = $derived(stats?.results.length ?? 0);
  let full = $derived(stats?.results.filter((r) => r.isComplete).length ?? 0);
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
    <div class="grid grid-cols-1 gap-4 @3xl:grid-cols-2">
      <ChartCard
        class="@3xl:col-span-2"
        title={$t('stats.combined.title')}
        subtitle={$t('stats.combined.subtitle')}
        domain={100}
        plotHeight={260}
        layers={combined.layers}
        markers={combined.markers}
        spans={combined.spans}
        curve={combined.curve}
        axisLabel={$t('stats.submissionHistogram.axisLabel')}
        examTitle={exam?.title ?? ''}
        fileName="noten_prozentverteilung"
      >
        {#if combined.markers.length}
          <p class="mt-2 text-xs text-muted">{$t('stats.combined.markers.legend')}</p>
        {/if}
      </ChartCard>
      <BorderlineCases class="@3xl:col-span-2" cases={stats.borderline} examId={exam?.id ?? ''} {submissionIds} />
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
    <Button variant="outlined" severity="secondary" onClick={onOpenExport}>
      {$t('stats.page.exportButton')}
    </Button>
  </div>
</PageShell>

{#if showConfirmModal}
  <StatsExportModal onConfirm={onConfirmExport} onCancel={onCancelExport} />
{/if}
