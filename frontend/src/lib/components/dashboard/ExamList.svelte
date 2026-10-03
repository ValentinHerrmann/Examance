<script lang="ts">
  import type { ExamRecord } from "$lib/db/schema";
  import { formatExamCourse } from "$lib/utils/examLabel";
  import { t } from "$lib/i18n";
  import { fmt } from "$lib/utils/format";
  import { faTrash } from "@fortawesome/free-solid-svg-icons";
  import { Badge, Button, Card, EmptyState, ExpandableCard } from "$lib/components/ui";

  export let exams: ExamRecord[];
  export let examStatsMap: Map<string, { avgScore: number | null; count: number }>;
  export let isLoading = false;
  export let expandedExams: { [examId: string]: boolean } = {};
  export let onToggleExam: (examId: string) => void;
  export let onDelete: (id: string, title?: string) => void;

  const previewPill = "rounded-xl border border-line bg-surface-sunken px-2.5 py-1 text-xs text-muted";
</script>

{#if isLoading}
  <div class="p-12 text-center text-muted">{$t("dashboard.examList.loading")}</div>
{:else if exams.length === 0}
  <Card>
    <EmptyState title={$t("dashboard.examList.noResults")} />
  </Card>
{:else}
  <div class="flex flex-col gap-4">
    {#each exams as exam (exam.id)}
      {@const stats = examStatsMap.get(exam.id)}
      {@const courseLabel = formatExamCourse(exam.grade, exam.klasse)}
      {@const isExpanded = !!expandedExams[exam.id]}
      <ExpandableCard expanded={isExpanded} onToggle={() => onToggleExam(exam.id)}>
        <svelte:fragment slot="header">
          <div class="flex items-start gap-4">
            <div class="flex min-w-0 flex-1 flex-wrap items-center gap-3">
              <h3 class="m-0 text-lg font-semibold break-words text-content">{exam.title || $t("dashboard.examList.untitledExam")}</h3>
              <div class="flex flex-wrap items-center gap-2">
                {#if courseLabel}
                  <Badge severity="info">{$t("dashboard.examList.classLabel", { course: courseLabel })}</Badge>
                {/if}
                {#if exam.fach}
                  <Badge severity="success">{exam.fach}</Badge>
                {/if}
                {#if exam.testart}
                  <Badge>{exam.testart}</Badge>
                {/if}
                {#if stats && stats.avgScore !== null}
                  <Badge severity="primary">{$t("dashboard.examList.averageScore", { score: stats.avgScore })}</Badge>
                {/if}
                {#if stats && stats.count > 0}
                  <Badge severity="secondary">{$t("dashboard.examList.submissionsCount", { count: stats.count })}</Badge>
                {/if}
                <span on:click|stopPropagation on:keydown|stopPropagation role="presentation">
                  <Button
                    variant="text"
                    severity="secondary"
                    size="sm"
                    iconOnly
                    icon={faTrash}
                    title={$t("dashboard.examList.deleteTitle")}
                    ariaLabel={$t("dashboard.examList.deleteTitle")}
                    onClick={() => onDelete(exam.id, exam.title)}
                  />
                </span>
              </div>
            </div>

            <!-- Date preview (collapsed only) -->
            {#if !isExpanded && (exam.datum || exam.createdAt)}
              <div class="mt-2 flex flex-wrap gap-2">
                <span class={previewPill}>
                  {exam.datum || $fmt.date(exam.createdAt)}
                </span>
              </div>
            {/if}
          </div>
        </svelte:fragment>

        <svelte:fragment slot="body">
          <div class="flex flex-wrap gap-x-6 gap-y-1 text-sm text-content">
            {#if exam.datum}
              <span>{$t("dashboard.examList.dateLabel", { date: exam.datum })}</span>
            {:else if exam.createdAt}
              <span>{$t("dashboard.examList.dateLabel", { date: $fmt.date(exam.createdAt) })}</span>
            {/if}
            {#if stats && stats.count > 0}
              <span>{$t("dashboard.examList.submissionsCount", { count: stats.count })}</span>
            {/if}
          </div>
          {#if exam.retentionUntil}
            <p class="m-0 mt-1 text-xs text-muted">{$t("dashboard.examList.retentionUntil", { date: exam.retentionUntil })}</p>
          {/if}

          <div class="mt-3 flex justify-end gap-2 border-t border-dashed border-line pt-4">
            <Button href="/exam/{exam.id}" size="sm">{$t("dashboard.examList.openExam")}</Button>
            <Button
              variant="outlined"
              severity="danger"
              size="sm"
              icon={faTrash}
              onClick={() => onDelete(exam.id, exam.title)}
            >{$t("common.delete")}</Button>
          </div>
        </svelte:fragment>
      </ExpandableCard>
    {/each}
  </div>
{/if}
