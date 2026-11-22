<script lang="ts">
  import type { Snippet } from "svelte";
  import type { GradeDetail } from "#lib/analytics/gradingKey";
  import { t } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { faCaretDown, faCaretUp, faStar } from "@fortawesome/free-solid-svg-icons";
  import { Badge, Icon } from "#lib/components/ui";

  /** The score card's header (issue #330): points, both percentages, the grade (preliminary until every exercise is scored) and how far the neighbouring grades are; the same in the open and the folded card. */
  interface Props {
    isFullyGraded: boolean;
    sumGradedScores: number;
    gradedCount: number;
    exercisesLength: number;
    totalMaxPoints: number;
    /** Maximum of the exercises scored so far: the preliminary grade is projected from it. */
    gradedMaxPoints: number;
    /** Grade of the points so far against `gradedMaxPoints` (final once fully graded). */
    gradeDetail: GradeDetail | null;
    /** Sits at the end of the first line (the card's fold button). */
    end?: Snippet;
  }

  let { isFullyGraded, sumGradedScores, gradedCount, exercisesLength, totalMaxPoints, gradedMaxPoints, gradeDetail, end }: Props = $props();

  let percentTotal = $derived(totalMaxPoints > 0 ? sumGradedScores / totalMaxPoints : 0);
  let percentGraded = $derived(gradedMaxPoints > 0 ? sumGradedScores / gradedMaxPoints : 0);
</script>

<div class="flex min-w-0 flex-col gap-0.5 text-xs leading-tight">
  <!-- Points and grade wrap as whole pieces: in the slim card the badge moves under the points instead of squeezing them. -->
  <div class="flex min-w-0 items-start gap-1">
    <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <span class="whitespace-nowrap">
        <span class="text-xl font-bold text-content tabular-nums">{$fmt.number(sumGradedScores)}</span>
        <span class="text-muted">{$t("grading.summary.maxPoints", { max: $fmt.number(totalMaxPoints) })}</span>
      </span>
      {#if gradeDetail}
        <Badge severity={isFullyGraded ? "info" : "secondary"}>
          <span class="whitespace-nowrap" title={isFullyGraded ? gradeDetail.label : $t("grading.summary.preliminaryTitle")}>
            {$t("grading.summary.gradeBadge", { grade: gradeDetail.grade })}{isFullyGraded ? "" : ` ${$t("grading.summary.preliminary")}`}
          </span>
        </Badge>
      {/if}
    </div>
    {@render end?.()}
  </div>

  <!-- Two different shares: of the exercises scored so far (what the preliminary grade follows) and of the whole exam; equal once fully graded. -->
  <div class="text-muted">
    {#if isFullyGraded || gradedCount === 0}
      <span title={$t("grading.summary.percentTotalTitle")}><strong class="text-content tabular-nums">{$fmt.percent(percentTotal, 0)}</strong></span>
    {:else}
      <span title={$t("grading.summary.percentGradedTitle")}><strong class="text-content tabular-nums">{$fmt.percent(percentGraded, 0)}</strong> {$t("grading.summary.percentGraded")}</span>
      ·
      <span title={$t("grading.summary.percentTotalTitle")}><strong class="text-content tabular-nums">{$fmt.percent(percentTotal, 0)}</strong> {$t("grading.summary.percentTotal")}</span>
    {/if}
  </div>

  {#if gradeDetail}
    <div class="flex flex-wrap gap-x-2">
      {#if gradeDetail.nextHigher}
        <span class="inline-flex items-center gap-0.5 whitespace-nowrap text-success-fg" title={$t("grading.summary.nextHigher", { points: $fmt.number(gradeDetail.nextHigher.pointsNeeded), grade: gradeDetail.nextHigher.grade })}>
          <Icon icon={faCaretUp} />{$t("grading.summary.nextHigherShort", { points: $fmt.number(gradeDetail.nextHigher.pointsNeeded), grade: gradeDetail.nextHigher.grade })}
        </span>
      {:else}
        <span class="inline-flex items-center gap-0.5 whitespace-nowrap text-warning-fg" title={$t("grading.summary.maxAchievedTitle")}>
          <Icon icon={faStar} />{$t("grading.summary.maxAchieved")}
        </span>
      {/if}
      {#if gradeDetail.nextLower}
        <span class="inline-flex items-center gap-0.5 whitespace-nowrap text-muted" title={$t("grading.summary.nextLower", { points: $fmt.number(gradeDetail.nextLower.pointsBuffer), grade: gradeDetail.nextLower.grade })}>
          <Icon icon={faCaretDown} />{$t("grading.summary.nextLowerShort", { points: $fmt.number(gradeDetail.nextLower.pointsBuffer), grade: gradeDetail.nextLower.grade })}
        </span>
      {/if}
    </div>
  {/if}

  {#if !isFullyGraded}
    <span class="text-warning-fg" title={$t("grading.summary.inProgressTitle")}>{$t("grading.summary.inProgress", { graded: gradedCount, total: exercisesLength })}</span>
  {/if}
</div>
