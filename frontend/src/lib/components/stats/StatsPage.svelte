<script lang="ts">
  import { t, type TranslationKey } from '$lib/i18n';
  import { fmt } from '$lib/utils/format';
  import type { ExamRecord } from '$lib/db/schema';
  import type { ExamStats } from '$lib/analytics/stats';
  import { PageShell, PageHeader, Button, Card } from '$lib/components/ui';
  import StatsCards from './StatsCards.svelte';
  import ColumnChart from './ColumnChart.svelte';
  import { binColumns, gradeBands, gradeColumns } from './chartColumns';
  import StatsExportModal from './StatsExportModal.svelte';

  export let exam: ExamRecord | null;
  export let stats: ExamStats | null;
  export let totalMaxPoints: number | null;
  export let submissionCount: number;
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

  $: grades = gradeColumns(stats?.gradeBuckets ?? [], $t, $fmt.percent);
  $: bins = binColumns(stats?.bins ?? []);
  $: bands = gradeBands(stats?.gradeBuckets ?? []);
  $: provisional = (stats?.results ?? []).some((r) => !r.isComplete);

  $: graded = stats?.results.length ?? 0;
  $: full = stats?.results.filter((r) => r.isComplete).length ?? 0;
</script>

<PageShell width="wide">
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
    <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card>
        <h3 class="text-base font-semibold text-content">{$t('stats.gradeDistribution.title')}</h3>
        <p class="mb-4 mt-1 text-xs text-muted">{$t('stats.gradeDistribution.gradingKeyPrefix')} {$t(preset)}</p>
        <ColumnChart
          domain={grades.length}
          layers={[{ columns: grades, fill: 0.72, labels: 'axis', values: true }]}
          axisLabel={$t('stats.gradeDistribution.axisLabel')}
          ariaLabel={$t('stats.gradeDistribution.title')}
        />
      </Card>
      <Card>
        <h3 class="mb-4 text-base font-semibold text-content">{$t('stats.submissionHistogram.title')}</h3>
        <ColumnChart
          domain={100}
          layers={[{ columns: bins, fill: 0.72, labels: 'axis', values: true }]}
          axisLabel={$t('stats.submissionHistogram.axisLabel')}
          ariaLabel={$t('stats.submissionHistogram.title')}
        />
      </Card>
      <Card class="xl:col-span-2">
        <h3 class="text-base font-semibold text-content">{$t('stats.combined.title')}</h3>
        <p class="mb-4 mt-1 text-xs text-muted">{$t('stats.combined.subtitle')}</p>
        <ColumnChart
          domain={100}
          layers={[
            { columns: bands, fill: 0.96, opacity: 0.4, labels: 'top', values: false },
            { columns: bins, fill: 0.5, labels: 'axis', values: true },
          ]}
          axisLabel={$t('stats.submissionHistogram.axisLabel')}
          ariaLabel={$t('stats.combined.title')}
        />
      </Card>
    </div>
    {#if provisional}
      <p class="mt-2 flex items-center gap-2 text-xs text-subtle">
        <span class="inline-block h-2 w-4 rounded-sm bg-muted opacity-45"></span>
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
