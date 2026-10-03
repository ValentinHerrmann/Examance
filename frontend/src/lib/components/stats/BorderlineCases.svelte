<script lang="ts">
  import { t } from '$lib/i18n';
  import { fmt } from '$lib/utils/format';
  import { gradeColorVar, type BorderlineCase } from '$lib/analytics/gradingKey';
  import { Card } from '$lib/components/ui';

  interface Props {
    cases: BorderlineCase[];
    examId: string;
    /** Submission ids in grading-view order, so "#n" matches the grading header. */
    submissionIds: string[];
    class?: string;
  }

  let {
    cases,
    examId,
    submissionIds,
    class: className = ''
  }: Props = $props();

  // One column template for the header and every row, so the numbers line up.
  // Phone widths get narrower columns and smaller text, so a row fits a 320px screen.
  const ROW =
    'grid grid-cols-[2.25rem_minmax(0,1fr)_3.25rem_4rem_3rem] items-center gap-x-1.5 sm:grid-cols-[2.75rem_minmax(0,1fr)_4.5rem_5.5rem_4rem] sm:gap-x-3';

  let indexOf = $derived(new Map(submissionIds.map((id, i) => [id, i + 1])));
  let groups = $derived([
    { side: '+', mark: '+', title: $t('stats.borderline.plusTitle'), items: cases.filter((c) => c.side === '+') },
    { side: '-', mark: '−', title: $t('stats.borderline.minusTitle'), items: cases.filter((c) => c.side === '-') },
  ]);
  function pts(v: number) {
    return $fmt.number(v, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  let provisional = $derived(cases.some((c) => !c.isComplete));
</script>

<Card class={className}>
  <h3 class="text-base font-semibold text-content">{$t('stats.borderline.title')}</h3>
  <p class="mb-4 mt-1 text-xs text-muted">{$t('stats.borderline.subtitle')}</p>
  <div class="grid grid-cols-1 gap-6 @3xl:grid-cols-2">
    {#each groups as group (group.side)}
      <section class="min-w-0">
        <h4 class="mb-2 flex items-baseline gap-2 text-sm font-semibold text-muted">
          <span class="text-2xl font-bold tabular-nums text-content">{group.items.length}</span>
          <span>{group.title}</span>
        </h4>
        {#if group.items.length === 0}
          <p class="text-xs text-muted">{$t('stats.borderline.none')}</p>
        {:else}
          <div class="{ROW} px-2 pb-1 text-xs text-muted sm:px-3">
            <span class="truncate">{$t('stats.borderline.col.grade')}</span>
            <span class="truncate">{$t('stats.borderline.col.student')}</span>
            <span class="truncate text-right">{$t('stats.borderline.col.points')}</span>
            <span class="truncate text-right">{$t('stats.borderline.col.boundary')}</span>
            <span class="truncate text-right">{$t('stats.borderline.col.distance')}</span>
          </div>
          <ul class="flex flex-col gap-1">
            {#each group.items as c (c.submissionId + c.side)}
              {@const index = indexOf.get(c.submissionId) ?? 0}
              <li>
                <a
                  href={`/exam/${examId}/grade?submissionId=${encodeURIComponent(c.submissionId)}`}
                  class="{ROW} rounded-md border border-line px-2 py-1.5 text-xs tabular-nums sm:px-3 sm:text-sm hover:border-line-strong hover:bg-surface-sunken"
                  title={$fmt.percent(c.percentage / 100, 1)}
                  aria-label={$t('stats.borderline.openAria', { index })}
                >
                  <span
                    class="inline-flex justify-center rounded-md px-1 font-bold text-content"
                    style="background-color: {gradeColorVar(c.gradeIndex, c.gradeCount)}">{c.grade}{group.mark}</span
                  >
                  <span class="truncate text-muted">#{index}</span>
                  <span class="text-right text-content"
                    >{pts(c.points)}{#if !c.isComplete}<span class="text-warning-fg">*</span>{/if}</span
                  >
                  <span class="text-right text-muted">{pts(c.boundaryPoints)} ({c.boundaryGrade})</span>
                  <span class="text-right font-semibold text-content"
                    >{group.side === '+' ? '−' : '+'}{pts(c.distance)}</span
                  >
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/each}
  </div>
  {#if provisional}
    <p class="mt-3 text-xs text-muted"><span class="text-warning-fg">*</span> {$t('stats.borderline.provisional')}</p>
  {/if}
</Card>
