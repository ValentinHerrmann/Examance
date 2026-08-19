<script lang="ts">
  import './StatsPage.css';
  import { t } from '$lib/i18n';
  import { fmt } from '$lib/utils/format';
  import type { ExamRecord } from '$lib/db/schema';
  import type { PercentageHistogramBin } from '$lib/analytics/stats';
  import type { GradeDistributionBucket } from '$lib/analytics/gradingKey';
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
  export let dataLoaded: boolean;
  export let exam: ExamRecord | null;
  export let bins: PercentageHistogramBin[];
  export let gradeBuckets: GradeDistributionBucket[];
  export let showConfirmModal: boolean;
  export let onOpenExport: () => void;
  export let onConfirmExport: () => void;
  export let onCancelExport: () => void;
</script>

<div class="stats-page">
  <h2>Class Grade Analytics & Export</h2>

  {#if submissionsLength > 0}
    <div class="stats-page-status-banner">
      <span>
        Status: <strong>{submissionsWithAnyGrade} von {submissionsLength}</strong> Abgaben mit mindestens einer korrigierten Aufgabe.
      </span>
      {#if fullyGradedCount < submissionsWithAnyGrade}
        <span class="stats-page-partial-indicator">
          ({submissionsWithAnyGrade - fullyGradedCount} teilweise korrigiert, {fullyGradedCount} vollständig)
        </span>
      {/if}
      {#if submissionsWithAnyGrade < submissionsLength}
        <span class="stats-page-pending-indicator">
          ({submissionsLength - submissionsWithAnyGrade} noch nicht begonnen)
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
    />

    {#if dataLoaded}
      <SubmissionHistogram {bins} />

      <GradeDistribution {exam} {gradeBuckets} />
    {/if}
  {:else}
    <div class="stats-page-empty-stats">
      <p>Noch keine Aufgaben korrigiert. Die Statistiken erscheinen hier, sobald du mit der Korrektur beginnst.</p>
    </div>
  {/if}

  <div class="stats-page-export-section">
    <button class="stats-page-export-btn" on:click={onOpenExport}>
      Export Grades CSV (Excel Compatible)
    </button>
  </div>

  {#if showConfirmModal}
    <StatsExportModal onConfirm={onConfirmExport} onCancel={onCancelExport} />
  {/if}
</div>
