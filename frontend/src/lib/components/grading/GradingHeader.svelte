<script lang="ts">
  import type { ExamRecord, SubmissionRecord } from "$lib/db/schema";

  export let examId: string;
  export let exam: ExamRecord | null;
  export let currentIndex: number;
  export let submissionsLength: number;
  export let currentSub: SubmissionRecord | undefined;
  export let calculatedGrade: { grade: string; label: string } | null;
</script>

<div class="grading-header-row">
  <div class="header-left">
    <a href="/exam/{examId}" class="back-btn" title="Back to Exam Setup">← Exam</a>
    <div class="exam-info">
      <span class="exam-title">{exam?.title || "Exam"}</span>
      <span class="exam-meta">
        {exam?.testart || "Kurzarbeit"} • Klasse: {exam?.klasse || "-"} • Fach: {exam?.fach || "-"}
      </span>
    </div>
  </div>

  <div class="header-center">
    <div class="student-pill">
      <span class="student-label">Anonymous Student #{currentIndex + 1} of {submissionsLength}</span>
      <span class="pseudonym-hash" title={currentSub?.pseudonymHash}>
        ID: {currentSub?.pseudonymHash ? currentSub.pseudonymHash.substring(0, 10) : ''}...
      </span>
    </div>
  </div>

  <div class="header-right">
    {#if calculatedGrade}
      <div class="grade-pill">
        <span class="grade-pill-label">Grade:</span>
        <span class="grade-pill-val">{calculatedGrade.grade}</span>
        <span class="grade-pill-desc">({calculatedGrade.label})</span>
      </div>
    {/if}
  </div>
</div>

<style>
  .grading-header-row {
    flex-shrink: 0;
    height: 44px;
    background: #0f172a;
    border-bottom: 1px solid #1e293b;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0.75rem;
    gap: 1rem;
    z-index: 10;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }

  .back-btn {
    background: #1e293b;
    color: #94a3b8;
    text-decoration: none;
    font-size: 0.8rem;
    font-weight: 500;
    padding: 0.25rem 0.6rem;
    border-radius: 6px;
    border: 1px solid #334155;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .back-btn:hover {
    color: #38bdf8;
    border-color: #38bdf8;
    background: #334155;
  }

  .exam-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
  }

  .exam-title {
    font-weight: 700;
    color: #38bdf8;
    font-size: 0.95rem;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .exam-meta {
    font-size: 0.75rem;
    color: #64748b;
  }

  .header-center {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .student-pill {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: #1e293b;
    border: 1px solid #334155;
    padding: 0.2rem 0.65rem;
    border-radius: 9999px;
    font-size: 0.8rem;
  }

  .student-label {
    font-weight: 600;
    color: #f1f5f9;
  }

  .pseudonym-hash {
    font-family: monospace;
    font-size: 0.725rem;
    color: #94a3b8;
    background: #0f172a;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .grade-pill {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    background: rgba(99, 102, 241, 0.15);
    border: 1px solid rgba(99, 102, 241, 0.3);
    padding: 0.2rem 0.65rem;
    border-radius: 8px;
    font-size: 0.8rem;
  }

  .grade-pill-label {
    color: #818cf8;
    font-size: 0.75rem;
  }

  .grade-pill-val {
    font-weight: 700;
    color: #e0e7ff;
    font-size: 0.95rem;
  }

  .grade-pill-desc {
    color: #a5b4fc;
    font-size: 0.725rem;
  }
</style>
