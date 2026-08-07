<script lang="ts">
  export let totalExams: number;
  export let subjectCount: number;
  export let gradeCount: number;
</script>

<div class="kpi-sidebar">
  <div class="kpi-grid">
    <div class="kpi-card">
      <span class="kpi-title">Total Exams</span>
      <span class="kpi-value">{totalExams}</span>
    </div>
    <div class="kpi-card">
      <span class="kpi-title">Configured Subjects</span>
      <span class="kpi-value">{subjectCount}</span>
    </div>
    <div class="kpi-card">
      <span class="kpi-title">Grade Levels</span>
      <span class="kpi-value">{gradeCount}</span>
    </div>
    <div class="kpi-card highlight">
      <span class="kpi-title">Global Analytics</span>
      <a href="/analytics" class="kpi-link">View Multi-Exam Stats →</a>
    </div>
  </div>
</div>

<style>
  .kpi-sidebar {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  @media (max-width: 1199px) {
    .kpi-sidebar .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.75rem;
    }
  }

  .kpi-grid {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .kpi-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .kpi-card.highlight {
    border-color: #0284c7;
    background: rgba(2, 132, 199, 0.1);
  }

  .kpi-title {
    font-size: 0.8rem;
    font-weight: 500;
    color: #94a3b8;
  }

  .kpi-value {
    font-size: 1.75rem;
    font-weight: 700;
    color: #f8fafc;
  }

  .kpi-link {
    font-size: 0.9rem;
    font-weight: 600;
    color: #38bdf8;
    text-decoration: none;
    margin-top: auto;
  }

  .kpi-link:hover {
    text-decoration: underline;
  }
</style>
