<script lang="ts">
  import type { GradeDetail } from "#lib/analytics/gradingKey";
  import { t } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { faCaretDown, faCaretUp, faStar } from "@fortawesome/free-solid-svg-icons";
  import { Badge, Icon } from "#lib/components/ui";

  /** Points, percentage and grade of the student on screen; the grade is preliminary until every exercise is scored (issue #330). */
  interface Props {
    isFullyGraded: boolean;
    sumGradedScores: number;
    gradedCount: number;
    exercisesLength: number;
    totalMaxPoints: number;
    /** Grade of the points so far (final once fully graded). */
    gradeDetail: GradeDetail | null;
    /** Show how many points the next better and worse grade are away. */
    hints?: boolean;
    /** Show the points line; false shows only the hints. */
    summary?: boolean;
  }

  let { isFullyGraded, sumGradedScores, gradedCount, exercisesLength, totalMaxPoints, gradeDetail, hints = false, summary = true }: Props = $props();

  let percent = $derived(totalMaxPoints > 0 ? sumGradedScores / totalMaxPoints : 0);
</script>

<div class="flex min-w-0 flex-col gap-1">
  {#if summary}
  <div class="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 leading-tight">
    <span class="text-xl font-bold text-content tabular-nums">{sumGradedScores}</span>
    <span class="text-xs text-muted">{$t("grading.summary.maxPoints", { max: totalMaxPoints })}</span>
    <span class="text-xs font-semibold text-content tabular-nums">{$fmt.percent(percent, 0)}</span>
    {#if gradeDetail}
      <Badge severity={isFullyGraded ? "info" : "secondary"}>
        <span title={isFullyGraded ? gradeDetail.label : $t("grading.summary.preliminaryTitle")}>
          {$t("grading.summary.gradeBadge", { grade: gradeDetail.grade })}{isFullyGraded ? "" : ` ${$t("grading.summary.preliminary")}`}
        </span>
      </Badge>
    {/if}
  </div>
  {#if !isFullyGraded}
    <span class="text-xs text-warning-fg" title={$t("grading.summary.inProgressTitle")}>{$t("grading.summary.inProgress", { graded: gradedCount, total: exercisesLength })}</span>
  {/if}
  {/if}

  {#if hints && gradeDetail}
    <div class="flex flex-col gap-0.5 text-xs">
      {#if gradeDetail.nextHigher}
        <div class="flex items-start gap-1 text-success-fg" title={$t("grading.summary.nextHigherTitle")}>
          <Icon icon={faCaretUp} class="mt-0.5" />
          <span class="min-w-0">{$t("grading.summary.nextHigher", { points: gradeDetail.nextHigher.pointsNeeded, grade: gradeDetail.nextHigher.grade })}</span>
        </div>
      {:else}
        <div class="flex items-start gap-1 text-warning-fg" title={$t("grading.summary.maxAchievedTitle")}>
          <Icon icon={faStar} class="mt-0.5" />
          <span class="min-w-0">{$t("grading.summary.maxAchieved")}</span>
        </div>
      {/if}
      {#if gradeDetail.nextLower}
        <div class="flex items-start gap-1 text-muted" title={$t("grading.summary.nextLowerTitle")}>
          <Icon icon={faCaretDown} class="mt-0.5" />
          <span class="min-w-0">{$t("grading.summary.nextLower", { points: gradeDetail.nextLower.pointsBuffer, grade: gradeDetail.nextLower.grade })}</span>
        </div>
      {/if}
    </div>
  {/if}
</div>
