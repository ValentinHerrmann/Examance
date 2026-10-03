<script lang="ts">
  import type { ExamRecord } from '$lib/db/schema';
  import { formatExamCourse } from '$lib/utils/examLabel';
  import { t } from "$lib/i18n";
  import { fmt } from "$lib/utils/format";

  export let exams: ExamRecord[];
  export let examStatsMap: Map<string, { avgScore: number | null; count: number }>;
  export let onNavigate: (id: string) => void;
  export let onDelete: (id: string, title?: string) => void;
</script>

{#if exams.length === 0}
  <div class="rounded-xl border border-dashed border-line bg-surface-raised px-8 py-16 text-center">
    <p class="text-lg text-muted">{$t("dashboard.examGrid.noResults")}</p>
  </div>
{:else}
  <div class="grid gap-6" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));">
    {#each exams as exam}
      {@const stats = examStatsMap.get(exam.id)}
      {@const courseLabel = formatExamCourse(exam.grade, exam.klasse)}
      <div
        class="cursor-pointer rounded-md border border-line bg-surface-raised p-6 transition-colors duration-150 ease-in-out hover:border-primary hover:bg-surface-inset"
        role="button"
        tabindex="0"
        on:click={() => onNavigate(exam.id)}
        on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(exam.id); } }}
      >
        <h3 class="m-0 mb-2 text-accent">{exam.title || $t("dashboard.examGrid.untitledExam")}</h3>
        <div class="mb-3 flex flex-wrap gap-1.5">
          {#if courseLabel}
            <span class="rounded-sm border border-info bg-info/10 px-2 py-0.5 text-xs text-info-fg"
              >{$t("dashboard.examGrid.classLabel", { course: courseLabel })}</span
            >
          {/if}
          {#if exam.fach}
            <span class="rounded-sm border border-success bg-success/10 px-2 py-0.5 text-xs text-success-fg"
              >{exam.fach}</span
            >
          {/if}
          {#if exam.testart}
            <span class="rounded-sm bg-surface-inset px-2 py-0.5 text-xs text-content">{exam.testart}</span>
          {/if}
          {#if stats?.avgScore !== undefined && stats.avgScore !== null}
            <span class="rounded-sm bg-primary px-2 py-0.5 text-xs font-semibold text-accent"
              >{$t("dashboard.examGrid.averageScore", { score: stats.avgScore })}</span
            >
          {/if}
        </div>
        {#if exam.datum}
          <p class="mb-1 text-sm text-content">{$t("dashboard.examGrid.dateLabel", { date: exam.datum })}</p>
        {:else if exam.createdAt}
          <p class="mb-1 text-sm text-content">{$t("dashboard.examGrid.dateLabel", { date: $fmt.date(exam.createdAt) })}</p>
        {/if}
        {#if exam.retentionUntil}
          <p class="mb-4 text-xs text-muted">{$t("dashboard.examGrid.retentionUntil", { date: exam.retentionUntil })}</p>
        {/if}
        <div class="flex items-center justify-between">
          <a href="/exam/{exam.id}" class="font-medium text-accent no-underline" on:click|stopPropagation>{$t("dashboard.examGrid.openExam")}</a>
          <button
            class="rounded-sm border border-danger bg-transparent px-2.5 py-1 text-xs text-danger-fg hover:bg-danger hover:text-danger-contrast"
            on:click|stopPropagation={() => onDelete(exam.id, exam.title)}>{$t("common.delete")}</button
          >
        </div>
      </div>
    {/each}
  </div>
{/if}
