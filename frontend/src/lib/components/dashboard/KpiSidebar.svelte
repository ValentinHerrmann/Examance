<script lang="ts">
  import './KpiSidebar.css';

  export let totalExams: number;
  export let subjectCount: number;
  export let gradeCount: number;
</script>

<div class="kpi-sidebar-kpi-sidebar">
  <div class="kpi-sidebar-kpi-grid">
    <div class="kpi-sidebar-kpi-card">
      <span class="kpi-sidebar-kpi-title">Total Exams</span>
      <span class="kpi-sidebar-kpi-value">{totalExams}</span>
    </div>
    <div class="kpi-sidebar-kpi-card">
      <span class="kpi-sidebar-kpi-title">Configured Subjects</span>
      <span class="kpi-sidebar-kpi-value">{subjectCount}</span>
    </div>
    <div class="kpi-sidebar-kpi-card">
      <span class="kpi-sidebar-kpi-title">Grade Levels</span>
      <span class="kpi-sidebar-kpi-value">{gradeCount}</span>
    </div>
    <div class="kpi-sidebar-kpi-card kpi-sidebar-highlight">
      <span class="kpi-sidebar-kpi-title">Global Analytics</span>
      <a href="/analytics" class="kpi-sidebar-kpi-link">View Multi-Exam Stats →</a>
    </div>
  </div>
</div>
