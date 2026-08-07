<script lang="ts">
  export let meanPercentage: number;
  export let stdDevPercentage: number;
  export let medianPercentage: number;
  export let submissionsWithAnyGrade: number;
</script>

<div class="stats-grid">
  <div class="stat-card">
    <span class="label">Submissions (mit Noten)</span>
    <span class="value">{submissionsWithAnyGrade}</span>
  </div>
  <div class="stat-card">
    <span class="label">Ø Prozent</span>
    <span class="value">{meanPercentage}%</span>
  </div>
  <div class="stat-card">
    <span class="label">StdAbw</span>
    <span class="value">{stdDevPercentage}%</span>
  </div>
  <div class="stat-card">
    <span class="label">Median</span>
    <span class="value">{medianPercentage}%</span>
  </div>
</div>

<style>
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    margin-bottom: 2rem;
  }

  @media (max-width: 768px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .stat-card {
    background: #1e293b;
    padding: 1.25rem;
    border-radius: 8px;
    text-align: center;
    border: 1px solid #334155;
  }

  .stat-card .label {
    font-size: 0.75rem;
    color: #94a3b8;
    display: block;
  }

  .stat-card .value {
    font-size: 1.75rem;
    font-weight: 700;
    color: #38bdf8;
  }
</style>
