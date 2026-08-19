<script lang="ts">
  import "./KpiSummaryBar.css";
  import { t } from '$lib/i18n';
  import { fmt } from '$lib/utils/format';
  export let examsCount: number;
  export let totalSubmissionsCount: number;
  export let gradedSubmissionsCount: number;
  export let overallAvgScore: number | null;
  export let flaggedCount: number;
</script>

<div class="ksb-grid">
  <div class="ksb-card">
    <span class="ksb-title">{$t('stats.kpi.totalExams')}</span>
    <span class="ksb-value">{$fmt.number(examsCount)}</span>
  </div>

  <div class="ksb-card">
    <span class="ksb-title">{$t('stats.kpi.submissionsProcessed')}</span>
    <span class="ksb-value">{$fmt.number(totalSubmissionsCount)}</span>
    <span class="ksb-sub">{$t('stats.kpi.gradedSuffix', { count: $fmt.number(gradedSubmissionsCount) })}</span>
  </div>

  <div class="ksb-card">
    <span class="ksb-title">{$t('stats.kpi.avgScore')}</span>
    <span class="ksb-value">
      {overallAvgScore !== null ? $t('stats.kpi.avgScoreValue', { score: $fmt.number(overallAvgScore) }) : $t('stats.kpi.avgScoreNA')}
    </span>
    <span class="ksb-sub">{overallAvgScore !== null ? $t('stats.kpi.avgScoreAcrossGraded') : $t('stats.kpi.avgScoreNoRecords')}</span>
  </div>

  <div class="ksb-card ksb-danger-card">
    <span class="ksb-title">{$t('stats.kpi.flaggedExercises')}</span>
    <span class="ksb-value">{$fmt.number(flaggedCount)}</span>
  </div>
</div>

{#if gradedSubmissionsCount === 0}
  <div class="ksb-notice-banner">
    ℹ️ <strong>{$t('stats.kpi.noticeBannerLead')}</strong>
    {$t('stats.kpi.noticeBannerBody')}
  </div>
{/if}
