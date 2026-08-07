<script lang="ts">
  import type { GradeDetail } from "$lib/analytics/gradingKey";

  export let isFullyGraded: boolean;
  export let totalScore: number | undefined;
  export let sumGradedScores: number;
  export let gradedCount: number;
  export let exercisesLength: number;
  export let totalMaxPoints: number;
  export let calculatedGradeDetail: GradeDetail | null;
</script>

<div class="total-score-card">
  <div class="total-score-top-row">
    <span class="total-score-label">Gesamtpunkte</span>
    <div class="total-score-val-wrap">
      {#if isFullyGraded}
        <span class="total-score-val">{totalScore}</span>
      {:else}
        <span class="total-score-val">{sumGradedScores}</span>
        <span class="total-score-in-progress" title="In Bearbeitung" style="font-size: 0.85rem; color: #fbbf24; margin-left: 4px;">({gradedCount}/{exercisesLength} korrigiert)</span>
      {/if}
      <span class="total-score-max">/ {totalMaxPoints} Pkt.</span>
    </div>
  </div>

  {#if calculatedGradeDetail}
    <div class="grade-detail-box">
      <div class="current-grade-row">
        <span class="grade-badge">Note {calculatedGradeDetail.grade}</span>
        <span class="grade-desc">({calculatedGradeDetail.label})</span>
      </div>

      <div class="grade-margins-list">
        {#if calculatedGradeDetail.nextHigher}
          <div class="margin-item higher" title="Benötigte Punkte zur nächstbesseren Note">
            <span class="margin-icon">▲</span>
            <span class="margin-text">+{calculatedGradeDetail.nextHigher.pointsNeeded} Pkt. zu Note {calculatedGradeDetail.nextHigher.grade}</span>
          </div>
        {:else}
          <div class="margin-item max-achieved" title="Beste Note erreicht">
            <span class="margin-icon">★</span>
            <span class="margin-text">Höchste Note erreicht</span>
          </div>
        {/if}

        {#if calculatedGradeDetail.nextLower}
          <div class="margin-item lower" title="Punkte-Puffer vor der nächstschlechteren Note">
            <span class="margin-icon">▼</span>
            <span class="margin-text">-{calculatedGradeDetail.nextLower.pointsBuffer} Pkt. zu Note {calculatedGradeDetail.nextLower.grade}</span>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .total-score-card {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    background: #0f172a;
    padding: 0.5rem 0.65rem;
    border-radius: 6px;
    border: 1px solid #334155;
  }

  .total-score-top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .total-score-label {
    font-size: 0.775rem;
    color: #94a3b8;
    font-weight: 600;
  }

  .total-score-val-wrap {
    display: flex;
    align-items: baseline;
    gap: 0.2rem;
  }

  .total-score-val {
    font-size: 1.1rem;
    font-weight: 800;
    color: #38bdf8;
  }

  .total-score-max {
    font-size: 0.725rem;
    color: #64748b;
  }

  .grade-detail-box {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-top: 0.35rem;
    border-top: 1px dashed #1e293b;
  }

  .current-grade-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .grade-badge {
    background: rgba(99, 102, 241, 0.2);
    color: #818cf8;
    font-weight: 700;
    font-size: 0.8rem;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    border: 1px solid rgba(99, 102, 241, 0.3);
  }

  .grade-desc {
    font-size: 0.75rem;
    color: #cbd5e1;
    font-weight: 500;
  }

  .grade-margins-list {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    font-size: 0.7rem;
    margin-top: 0.1rem;
  }

  .margin-item {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .margin-item.higher {
    color: #34d399;
  }

  .margin-item.lower {
    color: #fb7185;
  }

  .margin-item.max-achieved {
    color: #fbbf24;
  }

  .margin-icon {
    font-size: 0.65rem;
  }

  .margin-text {
    font-weight: 500;
  }
</style>
