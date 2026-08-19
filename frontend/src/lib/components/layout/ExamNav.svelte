<script lang="ts">
  import "./ExamNav.css";
  import type { ExamRecord } from "$lib/db/schema";
  import { formatExamCourse } from "$lib/utils/examLabel";
  import { t } from "$lib/i18n";

  export let exam: ExamRecord;
  export let examId: string;
  export let submissionCount: number;
  export let isSetupActive: boolean;
  export let isScanActive: boolean;
  export let isVerifyActive: boolean = false;
  export let isGradeActive: boolean;
  export let isManualActive: boolean = false;
  export let isStatsActive: boolean;
</script>

<div class="exam-header-bar">
  <div class="exam-nav-header-main">
    <h2>{exam.title || $t("exam.nav.examFallback")}</h2>
    <span class="exam-nav-meta">
      {exam.testart || "Kurzarbeit"} | {$t("common.className")}: {formatExamCourse(exam.grade, exam.klasse) || "-"} | {$t("common.subject")}: {exam.fach || "-"} | {$t("common.date")}: {exam.datum || "-"}
    </span>
  </div>
  <a href="/" class="exam-nav-back-link">{$t("exam.nav.backToDashboard")}</a>
</div>

<div class="exam-workflow-tabs">
  <a href="/exam/{examId}" class="exam-nav-tab-btn" class:active={isSetupActive}>{$t("exam.nav.tabs.setup")}</a>
  <a href="/exam/{examId}/scan" class="exam-nav-tab-btn" class:active={isScanActive}>{$t("exam.nav.tabs.scan", { count: submissionCount })}</a>
  <a href="/exam/{examId}/verify" class="exam-nav-tab-btn" class:active={isVerifyActive}>{$t("exam.nav.tabs.verify")}</a>
  <a href="/exam/{examId}/grade" class="exam-nav-tab-btn" class:active={isGradeActive}>{$t("exam.nav.tabs.grade")}</a>
  <a href="/exam/{examId}/manual" class="exam-nav-tab-btn" class:active={isManualActive}>{$t("exam.nav.tabs.manual")}</a>
  <a href="/exam/{examId}/stats" class="exam-nav-tab-btn highlight" class:active={isStatsActive}>{$t("exam.nav.tabs.stats")}</a>
</div>
