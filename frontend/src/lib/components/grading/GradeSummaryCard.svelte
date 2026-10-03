<script lang="ts">
  import type { GradeDetail } from "$lib/analytics/gradingKey";
  import { t } from "$lib/i18n";
  import { faCaretDown, faCaretUp, faStar } from "@fortawesome/free-solid-svg-icons";
  import { Badge, Icon } from "$lib/components/ui";

  export let isFullyGraded: boolean;
  export let totalScore: number | undefined;
  export let sumGradedScores: number;
  export let gradedCount: number;
  export let exercisesLength: number;
  export let totalMaxPoints: number;
  export let calculatedGradeDetail: GradeDetail | null;
</script>

<div class="flex flex-col gap-2">
  <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
    <span class="text-sm font-medium text-muted">{$t("grading.summary.totalPoints")}</span>
    <div class="flex flex-wrap items-baseline gap-x-1.5">
      {#if isFullyGraded}
        <span class="text-2xl font-bold text-content">{totalScore}</span>
      {:else}
        <span class="text-2xl font-bold text-content">{sumGradedScores}</span>
        <span class="text-sm text-warning-fg" title={$t("grading.summary.inProgressTitle")}>{$t("grading.summary.inProgress", { graded: gradedCount, total: exercisesLength })}</span>
      {/if}
      <span class="text-sm text-muted">{$t("grading.summary.maxPoints", { max: totalMaxPoints })}</span>
    </div>
  </div>

  {#if calculatedGradeDetail}
    <div class="flex flex-col gap-1.5 rounded-md border border-line bg-surface-sunken p-2">
      <div class="flex flex-wrap items-baseline gap-x-2">
        <Badge severity="info">{$t("grading.summary.gradeBadge", { grade: calculatedGradeDetail.grade })}</Badge>
        <span class="text-sm text-muted">({calculatedGradeDetail.label})</span>
      </div>

      <div class="flex flex-col gap-1 text-sm">
        {#if calculatedGradeDetail.nextHigher}
          <div class="flex items-start gap-2 text-success-fg" title={$t("grading.summary.nextHigherTitle")}>
            <Icon icon={faCaretUp} class="mt-1" />
            <span class="min-w-0">{$t("grading.summary.nextHigher", { points: calculatedGradeDetail.nextHigher.pointsNeeded, grade: calculatedGradeDetail.nextHigher.grade })}</span>
          </div>
        {:else}
          <div class="flex items-start gap-2 text-warning-fg" title={$t("grading.summary.maxAchievedTitle")}>
            <Icon icon={faStar} class="mt-1" />
            <span class="min-w-0">{$t("grading.summary.maxAchieved")}</span>
          </div>
        {/if}

        {#if calculatedGradeDetail.nextLower}
          <div class="flex items-start gap-2 text-muted" title={$t("grading.summary.nextLowerTitle")}>
            <Icon icon={faCaretDown} class="mt-1" />
            <span class="min-w-0">{$t("grading.summary.nextLower", { points: calculatedGradeDetail.nextLower.pointsBuffer, grade: calculatedGradeDetail.nextLower.grade })}</span>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
