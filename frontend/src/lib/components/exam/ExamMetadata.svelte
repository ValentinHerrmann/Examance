<script lang="ts">
  import "./ExamMetadata.css";
  import type { ExamRecord } from '$lib/db/schema';
  import { formatExamCourse } from '$lib/utils/examLabel';
  import { t } from '$lib/i18n';

  export let exam: ExamRecord | null;
  export let totalPoints: number;
  export let submissionsCount: number;
  export let studentsCount: number;
  export let gradedCount: number;
  export let storagePolicy: string;

  $: courseLabel = exam ? formatExamCourse(exam.grade, exam.klasse) : '';
</script>

{#if exam}
  <div class="exam-metadata">
    <h2>{exam.title}</h2>
    <div class="emd-meta-grid">
      {#if exam.testart}<span>{$t("exam.metadata.type")}: {exam.testart}</span>{/if}
      {#if courseLabel}<span>{$t("common.className")}: {courseLabel}</span>{/if}
      {#if exam.fach}<span>{$t("common.subject")}: {exam.fach}</span>{/if}
      {#if exam.lehrernachname}<span>{$t("common.teacher")}: {exam.lehrernachname}</span>{/if}
      {#if exam.datum}<span>{$t("common.date")}: {exam.datum}</span>{/if}
      <span>{$t("common.points")}: {totalPoints}</span>
      <span>{$t("exam.metadata.submissions")}: {submissionsCount}</span>
      <span>{$t("common.students")}: {studentsCount}</span>
      <span>{$t("exam.metadata.graded")}: {gradedCount}</span>
      {#if exam.gradingKey}
        <span>
          {$t("common.grade")}: {exam.gradingKey.preset === 'linear_50' ? $t("exam.metadata.gradeType.linear50") : exam.gradingKey.preset === 'linear_40' ? $t("exam.metadata.gradeType.linear40") : exam.gradingKey.preset === 'even_split' ? $t("exam.metadata.gradeType.even") : $t("exam.metadata.gradeType.custom")}
        </span>
      {/if}
    </div>
  </div>

  {#if storagePolicy === 'all-local'}
    <div class="emd-local-banner">
      <span>{$t("exam.metadata.localBanner")}</span>
    </div>
  {/if}
{/if}
