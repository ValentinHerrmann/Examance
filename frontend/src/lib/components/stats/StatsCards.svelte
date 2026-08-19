<script lang="ts">
  import './StatsCards.css';
  import { t } from '$lib/i18n';
  import { fmt } from '$lib/utils/format';
  export let meanPercentage: number;
  export let stdDevPercentage: number;
  export let medianPercentage: number;
  export let submissionsWithAnyGrade: number;
</script>

<div class="stats-cards-grid">
  <div class="stats-cards-card">
    <span class="label">{$t('stats.cards.submissionsGraded')}</span>
    <span class="value">{$fmt.number(submissionsWithAnyGrade)}</span>
  </div>
  <div class="stats-cards-card">
    <span class="label">{$t('stats.cards.avgPercent')}</span>
    <span class="value">{$fmt.percent(meanPercentage / 100)}</span>
  </div>
  <div class="stats-cards-card">
    <span class="label">{$t('stats.cards.stdDev')}</span>
    <span class="value">{$fmt.percent(stdDevPercentage / 100)}</span>
  </div>
  <div class="stats-cards-card">
    <span class="label">{$t('stats.cards.median')}</span>
    <span class="value">{$fmt.percent(medianPercentage / 100)}</span>
  </div>
</div>
