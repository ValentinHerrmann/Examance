<script lang="ts">
  import "./ExerciseQualityTable.css";
  import { TableScroller } from "$lib/components/ui";
  import { t } from '$lib/i18n';
  import { fmt } from '$lib/utils/format';
  import type { ExercisePerformance } from '$lib/analytics/analyticsTypes';

  export let exerciseStats: ExercisePerformance[];
  export let displayedExerciseStats: ExercisePerformance[];
  export let examsCount: number;
  export let showAll: boolean;
</script>

<div class="eqt-section-card">
  <div class="eqt-section-header-row">
    <div class="eqt-section-title-group">
      <h3>{$t('stats.exerciseQuality.title')}</h3>
      <p>{$t('stats.exerciseQuality.description')}</p>
    </div>

    {#if exerciseStats.some((e) => e.avgScorePercent === null)}
      <button
        class="eqt-toggle-btn"
        on:click={() => (showAll = !showAll)}
      >
        {showAll ? $t('stats.shared.toggleShowGraded') : $t('stats.shared.toggleShowAll')}
      </button>
    {/if}
  </div>

  {#if displayedExerciseStats.length === 0}
    <div class="eqt-empty-analytics-box">
      <div class="eqt-empty-icon">📊</div>
      <h4>{$t('stats.exerciseQuality.emptyTitle')}</h4>
      <p>
        {#if exerciseStats.length > 0}
          {$t('stats.exerciseQuality.emptyWithData', { count: $fmt.number(exerciseStats.length), examsCount: $fmt.number(examsCount) })}
        {:else}
          {$t('stats.exerciseQuality.emptyNoData')}
        {/if}
      </p>
      {#if exerciseStats.length > 0}
        <button
          class="eqt-secondary-toggle-btn"
          on:click={() => (showAll = !showAll)}
        >
          {showAll ? $t('stats.shared.hideUngraded') : $t('stats.exerciseQuality.showAllLinked', { count: $fmt.number(exerciseStats.length) })}
        </button>
      {/if}
    </div>
  {:else}
    <TableScroller>
    <table class="eqt-analytics-table">
      <thead>
        <tr>
          <th>{$t('stats.exerciseQuality.colName')}</th>
          <th>{$t('stats.exerciseQuality.colTopicTag')}</th>
          <th>{$t('stats.exerciseQuality.colExamsIncluded')}</th>
          <th>{$t('stats.exerciseQuality.colAvgScore')}</th>
          <th>{$t('stats.exerciseQuality.colQualityStatus')}</th>
        </tr>
      </thead>
      <tbody>
        {#each displayedExerciseStats as ex}
          <tr class:eqt-problematic-row={ex.flaggedProblematic}>
            <td class="eqt-ex-name">{ex.name}</td>
            <td><span class="eqt-tag">{ex.topicTag || $t('stats.exerciseQuality.generalTag')}</span></td>
            <td>{$t('stats.exerciseQuality.examsCountSuffix', { count: $fmt.number(ex.totalAppeared) })}</td>
            <td>
              {#if ex.avgScorePercent !== null}
                <div class="eqt-score-bar-container">
                  <div
                    class="eqt-score-bar"
                    style="width: {ex.avgScorePercent}%"
                    class:eqt-low-bar={ex.flaggedProblematic}
                  ></div>
                  <span class="eqt-score-text">{$fmt.percent(ex.avgScorePercent / 100, 0)}</span>
                </div>
              {:else}
                <span class="eqt-no-data-text">{$t('stats.shared.notGraded')}</span>
              {/if}
            </td>
            <td>
              {#if ex.avgScorePercent === null}
                <span class="eqt-status-badge eqt-neutral">{$t('stats.shared.noGradedData')}</span>
              {:else if ex.flaggedProblematic}
                <span class="eqt-status-badge eqt-danger">{$t('stats.exerciseQuality.highFailureRate')}</span>
              {:else}
                <span class="eqt-status-badge eqt-success">{$t('stats.exerciseQuality.balanced')}</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    </TableScroller>
  {/if}
</div>
