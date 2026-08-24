<script lang="ts">
  import type { ExamRecord } from '$lib/db/schema';
  import { t } from '$lib/i18n';

  export let exam: ExamRecord | null;
  export let totalPoints: number;
  export let submissionsCount: number;
  export let studentsCount: number;
  export let gradedCount: number;
  export let storagePolicy: string;

  $: gradeTypeLabel = exam?.gradingKey
    ? exam.gradingKey.preset === 'linear_50'
      ? $t("exam.metadata.gradeType.linear50")
      : exam.gradingKey.preset === 'linear_40'
        ? $t("exam.metadata.gradeType.linear40")
        : exam.gradingKey.preset === 'even_split'
          ? $t("exam.metadata.gradeType.even")
          : $t("exam.metadata.gradeType.custom")
    : null;
</script>

{#if exam}
  <!-- Title, testart, class, subject and date already appear once in ExamNav
       (the persistent header above the tab strip) — repeating them here as a
       second title block was the "multi-level top bars" losing height across
       every visit to this tab. Only the fields ExamNav doesn't show remain,
       as one compact stat row instead of a title-block-plus-grid. -->
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
    <div class="mb-6 rounded-md border border-amber-500 bg-surface-raised px-4 py-3 text-sm text-amber-400">
      {$t("exam.metadata.localBanner")}
    </div>
  {/if}
{/if}
