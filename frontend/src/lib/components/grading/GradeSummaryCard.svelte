<script lang="ts">
  import "./GradeSummaryCard.css";
  import type { GradeDetail } from "$lib/analytics/gradingKey";

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
    <span class="grade-summary-card-total-score-label">Gesamtpunkte</span>
    <div class="grade-summary-card-total-score-val-wrap">
      {#if isFullyGraded}
        <span class="grade-summary-card-total-score-val">{totalScore}</span>
      {:else}
        <span class="grade-summary-card-total-score-val">{sumGradedScores}</span>
        <span class="grade-summary-card-total-score-in-progress" title="In Bearbeitung" style="font-size: 0.85rem; color: #fbbf24; margin-left: 4px;">({gradedCount}/{exercisesLength} korrigiert)</span>
      {/if}
      <span class="grade-summary-card-total-score-max">/ {totalMaxPoints} Pkt.</span>
    </div>
  </div>

  {#if calculatedGradeDetail}
    <div class="grade-summary-card-grade-detail-box">
      <div class="grade-summary-card-current-grade-row">
        <span class="grade-summary-card-grade-badge">Note {calculatedGradeDetail.grade}</span>
        <span class="grade-summary-card-grade-desc">({calculatedGradeDetail.label})</span>
      </div>

      <div class="grade-summary-card-grade-margins-list">
        {#if calculatedGradeDetail.nextHigher}
          <div class="grade-summary-card-margin-item higher" title="Benötigte Punkte zur nächstbesseren Note">
            <span class="grade-summary-card-margin-icon">▲</span>
            <span class="grade-summary-card-margin-text">+{calculatedGradeDetail.nextHigher.pointsNeeded} Pkt. zu Note {calculatedGradeDetail.nextHigher.grade}</span>
          </div>
        {:else}
          <div class="grade-summary-card-margin-item max-achieved" title="Beste Note erreicht">
            <span class="grade-summary-card-margin-icon">★</span>
            <span class="grade-summary-card-margin-text">Höchste Note erreicht</span>
          </div>
        {/if}

        {#if calculatedGradeDetail.nextLower}
          <div class="grade-summary-card-margin-item lower" title="Punkte-Puffer vor der nächstschlechteren Note">
            <span class="grade-summary-card-margin-icon">▼</span>
            <span class="grade-summary-card-margin-text">-{calculatedGradeDetail.nextLower.pointsBuffer} Pkt. zu Note {calculatedGradeDetail.nextLower.grade}</span>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
