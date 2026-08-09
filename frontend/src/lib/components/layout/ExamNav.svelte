<script lang="ts">
  import "./ExamNav.css";
  import type { ExamRecord } from "$lib/db/schema";

  export let exam: ExamRecord;
  export let examId: string;
  export let submissionCount: number;
  export let isSetupActive: boolean;
  export let isScanActive: boolean;
  export let isGradeActive: boolean;
  export let isStatsActive: boolean;
</script>

<div class="exam-header-bar">
  <div class="exam-nav-header-main">
    <h2>{exam.title || "Exam"}</h2>
    <span class="exam-nav-meta">
      {exam.testart || "Kurzarbeit"} | Klasse: {exam.klasse || "-"} | Fach: {exam.fach || "-"} | Datum: {exam.datum || "-"}
    </span>
  </div>
  <a href="/" class="exam-nav-back-link">← Back to Dashboard</a>
</div>

<div class="exam-workflow-tabs">
  <a href="/exam/{examId}" class="exam-nav-tab-btn" class:active={isSetupActive}>1. Setup & Exercises</a>
  <a href="/exam/{examId}/scan" class="exam-nav-tab-btn" class:active={isScanActive}>2. Scan Ingestion ({submissionCount})</a>
  <a href="/exam/{examId}/grade" class="exam-nav-tab-btn" class:active={isGradeActive}>3. Anonymous Grading</a>
  <a href="/exam/{examId}/stats" class="exam-nav-tab-btn highlight" class:active={isStatsActive}>📊 4. Analysis & Statistics</a>
</div>
