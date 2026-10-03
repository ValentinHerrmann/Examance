<script lang="ts">
  import type { ExamRecord } from '$lib/db/schema';
  import { formatExamCourse } from '$lib/utils/examLabel';
  import { t } from "$lib/i18n";
  import { fmt } from "$lib/utils/format";
  import { Badge, Button, Card, EmptyState } from "$lib/components/ui";

  export let exams: ExamRecord[];
  export let examStatsMap: Map<string, { avgScore: number | null; count: number }>;
  export let onNavigate: (id: string) => void;
  export let onDelete: (id: string, title?: string) => void;
</script>

{#if exams.length === 0}
  <Card>
    <EmptyState title={$t("dashboard.examGrid.noResults")} />
  </Card>
{:else}
  <div class="grid grid-cols-[repeat(auto-fill,minmax(17.5rem,1fr))] gap-4">
    {#each exams as exam}
      {@const stats = examStatsMap.get(exam.id)}
      {@const courseLabel = formatExamCourse(exam.grade, exam.klasse)}
      <div
        class="min-w-0 cursor-pointer rounded-xl bg-surface-raised p-5 shadow-sm transition-colors duration-150 ease-in-out hover:bg-surface-inset"
        role="button"
        tabindex="0"
        on:click={() => onNavigate(exam.id)}
        on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(exam.id); } }}
      >
        <h3 class="m-0 mb-2 text-lg font-medium break-words text-accent">{exam.title || $t("dashboard.examGrid.untitledExam")}</h3>
        <div class="mb-3 flex flex-wrap gap-1.5">
          {#if courseLabel}
            <Badge severity="info" size="xs">{$t("dashboard.examGrid.classLabel", { course: courseLabel })}</Badge>
          {/if}
          {#if exam.fach}
            <Badge severity="success" size="xs">{exam.fach}</Badge>
          {/if}
          {#if exam.testart}
            <Badge size="xs">{exam.testart}</Badge>
          {/if}
          {#if stats?.avgScore !== undefined && stats.avgScore !== null}
            <Badge severity="primary" size="xs">{$t("dashboard.examGrid.averageScore", { score: stats.avgScore })}</Badge>
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
        <div class="mt-3 flex items-center justify-between gap-2">
          <a href="/exam/{exam.id}" class="font-medium text-accent no-underline hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center" on:click|stopPropagation>{$t("dashboard.examGrid.openExam")}</a>
          <Button
            variant="outlined"
            severity="danger"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onDelete(exam.id, exam.title); }}>{$t("common.delete")}</Button
          >
        </div>
      </div>
    {/each}
  </div>
{/if}
