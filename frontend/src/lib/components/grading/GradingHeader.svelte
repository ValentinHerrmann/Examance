<script lang="ts">
  import "./GradingHeader.css";
  import type { ExamRecord, SubmissionRecord } from "$lib/db/schema";

  export let examId: string;
  export let exam: ExamRecord | null;
  export let currentIndex: number;
  export let submissionsLength: number;
  export let currentSub: SubmissionRecord | undefined;
  export let calculatedGrade: { grade: string; label: string } | null;
</script>

<div class="grading-header-grading-header-row">
  <div class="grading-header-header-left">
    <a href="/exam/{examId}" class="grading-header-back-btn" title="Back to Exam Setup">← Exam</a>
    <div class="grading-header-exam-info">
      <span class="grading-header-exam-title">{exam?.title || "Exam"}</span>
      <span class="grading-header-exam-meta">
        {exam?.testart || "Kurzarbeit"} • Klasse: {exam?.klasse || "-"} • Fach: {exam?.fach || "-"}
      </span>
    </div>
  </div>

  <div class="grading-header-header-center">
    <div class="grading-header-student-pill">
      <span class="grading-header-student-label">Anonymous Student #{currentIndex + 1} of {submissionsLength}</span>
      <span class="grading-header-pseudonym-hash" title={currentSub?.pseudonymHash}>
        ID: {currentSub?.pseudonymHash ? currentSub.pseudonymHash.substring(0, 10) : ''}...
      </span>
    </div>
  </div>

  <div class="grading-header-header-right">
    {#if calculatedGrade}
      <div class="grading-header-grade-pill">
        <span class="grading-header-grade-pill-label">Grade:</span>
        <span class="grading-header-grade-pill-val">{calculatedGrade.grade}</span>
        <span class="grading-header-grade-pill-desc">({calculatedGrade.label})</span>
      </div>
    {/if}
  </div>
</div>
