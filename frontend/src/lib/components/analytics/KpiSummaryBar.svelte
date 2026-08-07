<script lang="ts">
  export let examsCount: number;
  export let totalSubmissionsCount: number;
  export let gradedSubmissionsCount: number;
  export let overallAvgScore: number | null;
  export let flaggedCount: number;
</script>

<div class="kpi-grid">
  <div class="kpi-card">
    <span class="kpi-title">Total Analyzed Exams</span>
    <span class="kpi-value">{examsCount}</span>
  </div>

  <div class="kpi-card">
    <span class="kpi-title">Submissions Processed</span>
    <span class="kpi-value">{totalSubmissionsCount}</span>
    <span class="kpi-sub">({gradedSubmissionsCount} graded)</span>
  </div>

  <div class="kpi-card">
    <span class="kpi-title">Avg. Score (pts)</span>
    <span class="kpi-value">
      {overallAvgScore !== null ? `${overallAvgScore} pts` : 'N/A'}
    </span>
    <span class="kpi-sub">{overallAvgScore !== null ? 'Across graded exams' : 'No scores recorded'}</span>
  </div>

  <div class="kpi-card danger-card">
    <span class="kpi-title">Flagged Exercises (&lt; 60%)</span>
    <span class="kpi-value">{flaggedCount}</span>
  </div>
</div>

{#if gradedSubmissionsCount === 0}
  <div class="notice-banner">
    ℹ️ <strong>No graded submissions recorded yet.</strong> As student scans are uploaded and scored, real-time cross-exam averages, quality metrics, and variant difficulty comparisons will automatically calculate below.
  </div>
{/if}

<style>
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1.25rem;
    margin-bottom: 1.5rem;
  }

  .kpi-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 10px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .kpi-card.danger-card {
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.1);
  }

  .kpi-title {
    font-size: 0.8rem;
    font-weight: 500;
    color: #94a3b8;
  }

  .kpi-value {
    font-size: 2rem;
    font-weight: 800;
    color: #f8fafc;
  }

  .kpi-sub {
    font-size: 0.75rem;
    color: #64748b;
  }

  .notice-banner {
    background: #1e293b;
    border: 1px solid #0284c7;
    color: #cbd5e1;
    padding: 0.85rem 1.25rem;
    border-radius: 8px;
    margin-bottom: 2rem;
    font-size: 0.9rem;
  }
</style>
