<script lang="ts">
  import type { GradeDetail } from "#lib/analytics/gradingKey";
  import { t } from "#lib/i18n";
  import { faCaretDown, faCaretUp, faStar } from "@fortawesome/free-solid-svg-icons";
  import { Badge, Icon } from "#lib/components/ui";

  interface Props {
    isFullyGraded: boolean;
    totalScore: number | undefined;
    sumGradedScores: number;
    gradedCount: number;
    exercisesLength: number;
    totalMaxPoints: number;
    calculatedGradeDetail: GradeDetail | null;
  }

  let {
    isFullyGraded,
    totalScore,
    sumGradedScores,
    gradedCount,
    exercisesLength,
    totalMaxPoints,
    calculatedGradeDetail
  }: Props = $props();
</script>

<div class="flex flex-col gap-1.5">
  <!-- From `lg` the 11rem score panel stacks the label above "points / max", the progress wraps below (issue #328). -->
  <div class="flex flex-wrap items-baseline justify-between gap-x-3 lg:flex-col lg:items-start lg:gap-0">
    <span class="text-sm font-medium text-muted lg:text-xs">{$t("grading.summary.totalPoints")}</span>
    <div class="flex flex-wrap items-baseline gap-x-1.5 leading-tight">
      <span class="text-2xl font-bold text-content lg:text-xl">{isFullyGraded ? totalScore : sumGradedScores}</span>
      <span class="text-sm text-muted lg:text-xs">{$t("grading.summary.maxPoints", { max: totalMaxPoints })}</span>
      {#if !isFullyGraded}
        <span class="text-sm text-warning-fg lg:text-xs" title={$t("grading.summary.inProgressTitle")}>{$t("grading.summary.inProgress", { graded: gradedCount, total: exercisesLength })}</span>
      {/if}
    </div>
  </div>

  {#if calculatedGradeDetail}
    <div class="flex flex-col gap-1.5 rounded-md border border-line bg-surface-sunken p-2 lg:gap-0.5 lg:p-1.5">
      <div class="flex flex-wrap items-baseline gap-x-2">
        <Badge severity="info">{$t("grading.summary.gradeBadge", { grade: calculatedGradeDetail.grade })}</Badge>
        <span class="text-sm text-muted lg:text-xs">({calculatedGradeDetail.label})</span>
      </div>

      <div class="flex flex-col gap-1 text-sm lg:text-xs">
        {#if calculatedGradeDetail.nextHigher}
          <div class="flex items-start gap-2 lg:gap-1 text-success-fg" title={$t("grading.summary.nextHigherTitle")}>
            <Icon icon={faCaretUp} class="mt-1" />
            <span class="min-w-0">{$t("grading.summary.nextHigher", { points: calculatedGradeDetail.nextHigher.pointsNeeded, grade: calculatedGradeDetail.nextHigher.grade })}</span>
          </div>
        {:else}
          <div class="flex items-start gap-2 lg:gap-1 text-warning-fg" title={$t("grading.summary.maxAchievedTitle")}>
            <Icon icon={faStar} class="mt-1" />
            <span class="min-w-0">{$t("grading.summary.maxAchieved")}</span>
          </div>
        {/if}

        {#if calculatedGradeDetail.nextLower}
          <div class="flex items-start gap-2 lg:gap-1 text-muted" title={$t("grading.summary.nextLowerTitle")}>
            <Icon icon={faCaretDown} class="mt-1" />
            <span class="min-w-0">{$t("grading.summary.nextLower", { points: calculatedGradeDetail.nextLower.pointsBuffer, grade: calculatedGradeDetail.nextLower.grade })}</span>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
