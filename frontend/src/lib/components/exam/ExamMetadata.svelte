<script lang="ts">
  import type { ExamRecord } from '#lib/db/schema';
  import { t } from '#lib/i18n';
  import { Alert } from '#lib/components/ui';

  interface Props {
    exam: ExamRecord | null;
    totalPoints: number;
    submissionsCount: number;
    studentsCount: number;
    gradedCount: number;
    storagePolicy: string;
  }

  let {
    exam,
    totalPoints,
    submissionsCount,
    studentsCount,
    gradedCount,
    storagePolicy
  }: Props = $props();

  let gradeTypeLabel = $derived(exam?.gradingKey
    ? exam.gradingKey.preset === 'linear_50'
      ? $t("exam.metadata.gradeType.linear50")
      : exam.gradingKey.preset === 'linear_40'
        ? $t("exam.metadata.gradeType.linear40")
        : exam.gradingKey.preset === 'even_split'
          ? $t("exam.metadata.gradeType.even")
          : $t("exam.metadata.gradeType.custom")
    : null);
</script>

{#if exam}
  <!-- Title/testart/class/subject/date are already in the exam page header; only the fields it lacks stay here, as one compact row. -->
  <div class="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
    {#if exam.lehrernachname}
      <span>{$t("common.teacher")}: {exam.lehrernachname}</span>
    {/if}
    <span>{$t("common.points")}: {totalPoints}</span>
    <span>{$t("exam.metadata.submissions")}: {submissionsCount}</span>
    <span>{$t("common.students")}: {studentsCount}</span>
    <span>{$t("exam.metadata.graded")}: {gradedCount}</span>
    {#if gradeTypeLabel}
      <span>{$t("common.grade")}: {gradeTypeLabel}</span>
    {/if}
  </div>

  {#if storagePolicy === 'all-local'}
    <Alert severity="warning" class="mb-6">{$t("exam.metadata.localBanner")}</Alert>
  {/if}
{/if}
