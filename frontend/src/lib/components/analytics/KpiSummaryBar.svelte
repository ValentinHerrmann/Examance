<script lang="ts">
  import { t } from '#lib/i18n';
  import { fmt } from '#lib/utils/format';
  import { Alert, Card } from '#lib/components/ui';

  interface Props {
    examsCount: number;
    totalSubmissionsCount: number;
    gradedSubmissionsCount: number;
    overallAvgScore: number | null;
    flaggedCount: number;
  }

  let {
    examsCount,
    totalSubmissionsCount,
    gradedSubmissionsCount,
    overallAvgScore,
    flaggedCount
  }: Props = $props();
</script>

<div class="mb-6 grid grid-cols-[repeat(auto-fit,minmax(13.75rem,1fr))] gap-4">
  <Card class="flex flex-col gap-1">
    <span class="text-sm text-muted">{$t('stats.kpi.totalExams')}</span>
    <span class="text-3xl font-semibold text-content">{$fmt.number(examsCount)}</span>
  </Card>

  <Card class="flex flex-col gap-1">
    <span class="text-sm text-muted">{$t('stats.kpi.submissionsProcessed')}</span>
    <span class="text-3xl font-semibold text-content">{$fmt.number(totalSubmissionsCount)}</span>
    <span class="text-xs text-muted">{$t('stats.kpi.gradedSuffix', { count: $fmt.number(gradedSubmissionsCount) })}</span>
  </Card>

  <Card class="flex flex-col gap-1">
    <span class="text-sm text-muted">{$t('stats.kpi.avgScore')}</span>
    <span class="text-3xl font-semibold text-content">
      {overallAvgScore !== null ? $t('stats.kpi.avgScoreValue', { score: $fmt.number(overallAvgScore) }) : $t('stats.kpi.avgScoreNA')}
    </span>
    <span class="text-xs text-muted">{overallAvgScore !== null ? $t('stats.kpi.avgScoreAcrossGraded') : $t('stats.kpi.avgScoreNoRecords')}</span>
  </Card>

  <Card tone="danger" class="flex flex-col gap-1">
    <span class="text-sm text-muted">{$t('stats.kpi.flaggedExercises')}</span>
    <span class="text-3xl font-semibold text-content">{$fmt.number(flaggedCount)}</span>
  </Card>
</div>

{#if gradedSubmissionsCount === 0}
  <Alert class="mb-6">
    <strong>{$t('stats.kpi.noticeBannerLead')}</strong>
    {$t('stats.kpi.noticeBannerBody')}
  </Alert>
{/if}
