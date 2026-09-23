<script lang="ts">
  import { t } from '$lib/i18n';
  import type { ExamRecord } from '$lib/db/schema';
  import type { ExamStats } from '$lib/analytics/stats';
  import { PageShell, PageHeader, Button, Card } from '$lib/components/ui';
  import StatsCards from './StatsCards.svelte';
  import SubmissionHistogram from './SubmissionHistogram.svelte';
  import GradeDistribution from './GradeDistribution.svelte';
  import StatsExportModal from './StatsExportModal.svelte';

  export let exam: ExamRecord | null;
  export let stats: ExamStats | null;
  export let totalMaxPoints: number | null;
  export let submissionCount: number;
  export let showConfirmModal: boolean;
  export let onOpenExport: () => void;
  export let onConfirmExport: () => void;
  export let onCancelExport: () => void;

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
      <GradeDistribution {exam} buckets={stats.gradeBuckets} />
      <SubmissionHistogram bins={stats.bins} />
    </div>
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
