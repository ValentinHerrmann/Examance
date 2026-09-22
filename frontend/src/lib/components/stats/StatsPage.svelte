<script lang="ts">
  import { t } from '$lib/i18n';
  import type { ExamRecord } from '$lib/db/schema';
  import type { PercentageHistogramBin } from '$lib/analytics/stats';
  import type { GradeDistributionBucket } from '$lib/analytics/gradingKey';
  import { PageShell, PageHeader, Button } from '$lib/components/ui';
  import StatsCards from './StatsCards.svelte';
  import SubmissionHistogram from './SubmissionHistogram.svelte';
  import GradeDistribution from './GradeDistribution.svelte';
  import StatsExportModal from './StatsExportModal.svelte';

  export let submissionsWithAnyGrade: number;
  export let submissionsLength: number;
  export let fullyGradedCount: number;
  export let meanPercentage: number;
  export let stdDevPercentage: number;
  export let medianPercentage: number;
  export let classGradeAverage: number | null = null;
  export let passRate: number | null = null;
  export let meanPoints: number | null = null;
  export let totalMaxPoints: number | null = null;
  export let dataLoaded: boolean;
  export let exam: ExamRecord | null;
  export let bins: PercentageHistogramBin[];
  export let gradeBuckets: GradeDistributionBucket[];
  export let showConfirmModal: boolean;
  export let onOpenExport: () => void;
  export let onConfirmExport: () => void;
  export let onCancelExport: () => void;

  $: partialCount = Math.max(0, submissionsWithAnyGrade - fullyGradedCount);
  $: pendingCount = Math.max(0, submissionsLength - submissionsWithAnyGrade);
</script>

<PageShell width="wide">
  <PageHeader title={$t('stats.page.title')} />

  {#if submissionsLength > 0}
    <div class="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
      <span>
        {$t('stats.page.statusBanner', {
          graded: submissionsWithAnyGrade,
          total: submissionsLength,
        })}
      </span>
      {#if partialCount > 0}
        <span class="text-amber-300">
          {$t('stats.page.partialIndicator', {
            partial: partialCount,
            full: fullyGradedCount,
          })}
        </span>
      {/if}
      {#if pendingCount > 0}
        <span class="text-subtle">
          {$t('stats.page.pendingIndicator', { pending: pendingCount })}
        </span>
      {/if}
    </div>
  {/if}

  {#if submissionsWithAnyGrade > 0}
    <StatsCards
      {submissionsWithAnyGrade}
      {meanPercentage}
      {stdDevPercentage}
      {medianPercentage}
      {classGradeAverage}
      {passRate}
      {meanPoints}
      {totalMaxPoints}
    />

    {#if dataLoaded}
      <!-- min-w-0 on both: each chart measures its own container, and a grid
           child without it refuses to shrink below its content. -->
      <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div class="min-w-0"><GradeDistribution {exam} {gradeBuckets} /></div>
        <div class="min-w-0"><SubmissionHistogram {bins} /></div>
      </div>
    {/if}
  {:else}
    <div class="rounded-xl border border-line bg-surface-raised px-4 py-6 text-sm text-muted">
      {$t('stats.page.emptyStats')}
    </div>
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
