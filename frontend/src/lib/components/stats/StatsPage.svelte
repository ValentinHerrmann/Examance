<script lang="ts">
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
    <div class="status-banner">
      <span>
        Status: <strong>{submissionsWithAnyGrade} von {submissionsLength}</strong> Abgaben mit mindestens einer korrigierten Aufgabe.
      </span>
      {#if fullyGradedCount < submissionsWithAnyGrade}
        <span class="partial-indicator">
          ({submissionsWithAnyGrade - fullyGradedCount} teilweise korrigiert, {fullyGradedCount} vollständig)
        </span>
      {/if}
      {#if submissionsWithAnyGrade < submissionsLength}
        <span class="pending-indicator">
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
    <div class="empty-stats">
      <p>Noch keine Aufgaben korrigiert. Die Statistiken erscheinen hier, sobald du mit der Korrektur beginnst.</p>
    </div>
  {/if}

  <div class="export-section">
    <button class="export-btn" on:click={onOpenExport}>
      Export Grades CSV (Excel Compatible)
    </button>
  </div>

  {#if showConfirmModal}
    <StatsExportModal onConfirm={onConfirmExport} onCancel={onCancelExport} />
  {/if}
</div>

<style>
  .stats-page {
    padding: 1.5rem;
    width: 100%;
    box-sizing: border-box;
  }

  h2 {
    color: #38bdf8;
  }

  .status-banner {
    margin-bottom: 1rem;
    color: #94a3b8;
    font-size: 0.95rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .partial-indicator {
    color: #fbbf24;
  }

  .pending-indicator {
    color: #64748b;
  }

  .empty-stats {
    background: #1e293b;
    padding: 2rem;
    border-radius: 8px;
    margin-bottom: 2rem;
    text-align: center;
    color: #64748b;
    border: 1px dashed #334155;
  }

  .export-section {
    margin-top: 1rem;
  }

  .export-btn {
    padding: 0.875rem 1.5rem;
    background: #0284c7;
    color: white;
    font-weight: 600;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .export-btn:hover {
    background: #0369a1;
  }
</style>
