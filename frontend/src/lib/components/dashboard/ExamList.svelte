<script lang="ts">
  import type { ExamRecord, ExerciseRecord } from "$lib/db/schema";
  import { formatExamCourse } from "$lib/utils/examLabel";
  import { t } from "$lib/i18n";
  import { fmt } from "$lib/utils/format";
  import { examNavItems } from "$lib/components/layout/examNavItems";
  import { faEye, faTrash } from "@fortawesome/free-solid-svg-icons";
  import { Badge, Button, Card, EmptyState, ExpandableCard } from "$lib/components/ui";

  export let exams: ExamRecord[];
  export let examStatsMap: Map<string, { avgScore: number | null; count: number }>;
  /** Lazily loaded per exam on first expand; absent = not requested yet. */
  export let exerciseMap: Map<string, ExerciseRecord[] | "loading"> = new Map();
  export let isLoading = false;
  export let expandedExams: { [examId: string]: boolean } = {};
  export let onToggleExam: (examId: string) => void;
  export let onDelete: (id: string, title?: string) => void;
  export let onPreview: (exam: ExamRecord) => void;

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
      <ExpandableCard
        title={exam.title || $t("dashboard.examList.untitledExam")}
        expanded={isExpanded}
        onToggle={() => onToggleExam(exam.id)}
      >
        <svelte:fragment slot="badges">
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
            <Badge severity="secondary">{$t("dashboard.examList.gradedCount", { count: stats.count })}</Badge>
          {/if}
        </svelte:fragment>

        <svelte:fragment slot="preview">
          {#if exam.datum || exam.createdAt}
            <span class={previewPill}>{exam.datum || $fmt.date(exam.createdAt)}</span>
          {/if}
        </svelte:fragment>

        <svelte:fragment slot="body">
          <div class="flex flex-wrap gap-x-6 gap-y-1 text-sm text-content">
            {#if exam.datum}
              <span>{$t("dashboard.examList.dateLabel", { date: exam.datum })}</span>
            {:else if exam.createdAt}
              <span>{$t("dashboard.examList.dateLabel", { date: $fmt.date(exam.createdAt) })}</span>
            {/if}
            {#if exam.numVersions && exam.numVersions > 1}
              <span>{$t("dashboard.examList.versionsCount", { count: exam.numVersions })}</span>
            {/if}
          </div>
          {#if exam.retentionUntil}
            <p class="m-0 mt-1 text-xs text-muted">{$t("dashboard.examList.retentionUntil", { date: exam.retentionUntil })}</p>
          {/if}

          {@const used = exerciseMap.get(exam.id)}
          <div class="mt-3">
            <h4 class="m-0 mb-2 text-sm font-semibold text-content">{$t("dashboard.examList.exercisesTitle")}</h4>
            {#if used === undefined || used === "loading"}
              <p class="m-0 text-sm text-muted">{$t("dashboard.examList.loadingExercises")}</p>
            {:else if used.length === 0}
              <p class="m-0 text-sm text-muted">{$t("dashboard.examList.noExercises")}</p>
            {:else}
              <ol class="m-0 flex list-none flex-col gap-1 p-0">
                {#each used as ex, i (ex.id)}
                  <li class="flex min-w-0 flex-wrap items-center gap-2 text-sm text-content">
                    <span class="w-6 shrink-0 text-right text-muted">{i + 1}.</span>
                    <span class="min-w-0 break-words">{ex.title || ex.name || $t("dashboard.examList.untitledExercise")}</span>
                    <Badge>v{ex.version ?? 1}</Badge>
                    {#if ex.variantKey && ex.variantKey !== "_General"}
                      <Badge severity="info">{ex.variantKey}</Badge>
                    {/if}
                  </li>
                {/each}
              </ol>
            {/if}
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            {#each examNavItems(exam.id, "") as item (item.step)}
              <Button href={item.href} variant="outlined" severity="secondary" size="sm" icon={item.icon}>
                {$t(item.labelKey)}
              </Button>
            {/each}
          </div>
        </svelte:fragment>

        <svelte:fragment slot="footer">
            <Button variant="outlined" severity="secondary" size="sm" icon={faEye} onClick={() => onPreview(exam)}>{$t("common.preview")}</Button>
            <Button href="/exam/{exam.id}" size="sm">{$t("dashboard.examList.openExam")}</Button>
            <Button
              variant="outlined"
              severity="danger"
              size="sm"
              icon={faTrash}
              onClick={() => onDelete(exam.id, exam.title)}
            >{$t("common.delete")}</Button>
        </svelte:fragment>
      </ExpandableCard>
    {/each}
  </div>
{/if}
