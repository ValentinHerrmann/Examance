<script lang="ts">
  import type { GradeDetail } from "$lib/analytics/gradingKey";
  import { t } from "$lib/i18n";

  export let isFullyGraded: boolean;
  export let totalScore: number | undefined;
  export let sumGradedScores: number;
  export let gradedCount: number;
  export let exercisesLength: number;
  export let totalMaxPoints: number;
  export let calculatedGradeDetail: GradeDetail | null;
</script>

<div class="grade-summary-card-total-score-card">
  <div class="grade-summary-card-total-score-top-row">
    <span class="grade-summary-card-total-score-label">{$t("grading.summary.totalPoints")}</span>
    <div class="grade-summary-card-total-score-val-wrap">
      {#if isFullyGraded}
        <span class="grade-summary-card-total-score-val">{totalScore}</span>
      {:else}
        <span class="grade-summary-card-total-score-val">{sumGradedScores}</span>
        <span class="grade-summary-card-total-score-in-progress" title={$t("grading.summary.inProgressTitle")} style="font-size: 0.85rem; color: #fbbf24; margin-left: 4px;">{$t("grading.summary.inProgress", { graded: gradedCount, total: exercisesLength })}</span>
      {/if}
      <span class="grade-summary-card-total-score-max">{$t("grading.summary.maxPoints", { max: totalMaxPoints })}</span>
    </div>
  </div>

  {#if calculatedGradeDetail}
    <div class="grade-summary-card-grade-detail-box">
      <div class="grade-summary-card-current-grade-row">
        <span class="grade-summary-card-grade-badge">{$t("grading.summary.gradeBadge", { grade: calculatedGradeDetail.grade })}</span>
        <span class="grade-summary-card-grade-desc">({calculatedGradeDetail.label})</span>
      </div>

      <div class="grade-summary-card-grade-margins-list">
        {#if calculatedGradeDetail.nextHigher}
          <div class="grade-summary-card-margin-item higher" title={$t("grading.summary.nextHigherTitle")}>
            <span class="grade-summary-card-margin-icon">▲</span>
            <span class="grade-summary-card-margin-text">{$t("grading.summary.nextHigher", { points: calculatedGradeDetail.nextHigher.pointsNeeded, grade: calculatedGradeDetail.nextHigher.grade })}</span>
          </div>
        {:else}
          <div class="grade-summary-card-margin-item max-achieved" title={$t("grading.summary.maxAchievedTitle")}>
            <span class="grade-summary-card-margin-icon">★</span>
            <span class="grade-summary-card-margin-text">{$t("grading.summary.maxAchieved")}</span>
          </div>
        {/if}

        {#if calculatedGradeDetail.nextLower}
          <div class="grade-summary-card-margin-item lower" title={$t("grading.summary.nextLowerTitle")}>
            <span class="grade-summary-card-margin-icon">▼</span>
            <span class="grade-summary-card-margin-text">{$t("grading.summary.nextLower", { points: calculatedGradeDetail.nextLower.pointsBuffer, grade: calculatedGradeDetail.nextLower.grade })}</span>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
