<script lang="ts">
  import './StatsCards.css';
  export let meanPercentage: number;
  export let stdDevPercentage: number;
  export let medianPercentage: number;
  export let submissionsWithAnyGrade: number;
</script>

<div class="stats-cards-grid">
  <div class="stats-cards-card">
    <span class="label">Submissions (mit Noten)</span>
    <span class="value">{submissionsWithAnyGrade}</span>
  </div>
  <div class="stats-cards-card">
    <span class="label">Ø Prozent</span>
    <span class="value">{meanPercentage}%</span>
  </div>
  <div class="stats-cards-card">
    <span class="label">StdAbw</span>
    <span class="value">{stdDevPercentage}%</span>
  </div>
  <div class="stats-cards-card">
    <span class="label">Median</span>
    <span class="value">{medianPercentage}%</span>
  </div>
</div>
