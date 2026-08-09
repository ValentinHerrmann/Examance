<script lang="ts">
  import "./KpiSummaryBar.css";
  export let examsCount: number;
  export let totalSubmissionsCount: number;
  export let gradedSubmissionsCount: number;
  export let overallAvgScore: number | null;
  export let flaggedCount: number;
</script>

<div class="ksb-grid">
  <div class="ksb-card">
    <span class="ksb-title">Total Analyzed Exams</span>
    <span class="ksb-value">{examsCount}</span>
  </div>

  <div class="ksb-card">
    <span class="ksb-title">Submissions Processed</span>
    <span class="ksb-value">{totalSubmissionsCount}</span>
    <span class="ksb-sub">({gradedSubmissionsCount} graded)</span>
  </div>

  <div class="ksb-card">
    <span class="ksb-title">Avg. Score (pts)</span>
    <span class="ksb-value">
      {overallAvgScore !== null ? `${overallAvgScore} pts` : 'N/A'}
    </span>
    <span class="ksb-sub">{overallAvgScore !== null ? 'Across graded exams' : 'No scores recorded'}</span>
  </div>

  <div class="ksb-card ksb-danger-card">
    <span class="ksb-title">Flagged Exercises (&lt; 60%)</span>
    <span class="ksb-value">{flaggedCount}</span>
  </div>
</div>

{#if gradedSubmissionsCount === 0}
  <div class="ksb-notice-banner">
    ℹ️ <strong>No graded submissions recorded yet.</strong> As student scans are uploaded and scored, real-time cross-exam averages, quality metrics, and variant difficulty comparisons will automatically calculate below.
  </div>
{/if}
