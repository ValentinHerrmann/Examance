<script lang="ts">
  import { t, type TranslationKey } from '$lib/i18n';
  import { fmt } from '$lib/utils/format';
  import type { ExamRecord } from '$lib/db/schema';
  import type { ExamStats } from '$lib/analytics/stats';
  import { PageShell, PageHeader, Button, Card } from '$lib/components/ui';
  import StatsCards from './StatsCards.svelte';
  import BorderlineCases from './BorderlineCases.svelte';
  import ChartCard from './ChartCard.svelte';
  import { binColumns, gradeBands, gradeColumns, type ChartLayer } from './chartColumns';
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
        <span class="text-amber-300">
          {$t('stats.page.partialIndicator', { partial: graded - full, full })}
        </span>
      {/if}
      {#if submissionCount > graded}
        <span class="text-subtle">
          {$t('stats.page.pendingIndicator', { pending: submissionCount - graded })}
        </span>
      {/if}
    </div>
  {/if}

  {#if stats?.summary}
    <StatsCards {stats} {totalMaxPoints} />
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard
        class="lg:col-span-2"
        title={$t('stats.combined.title')}
        subtitle={$t('stats.combined.subtitle')}
        domain={100}
        plotHeight={260}
        layers={combinedLayers}
        axisLabel={$t('stats.submissionHistogram.axisLabel')}
        examTitle={exam?.title ?? ''}
        fileName="noten_prozentverteilung"
      />
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
          <p class="mt-2 text-xs text-subtle">{$t('stats.gradeDistribution.borderlineLegend')}</p>
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
      <p class="mt-2 flex items-center gap-2 text-xs text-subtle">
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
