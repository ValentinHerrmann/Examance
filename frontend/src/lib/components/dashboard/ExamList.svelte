<script lang="ts">
  import type { ExamRecord, ExerciseRecord } from "#lib/db/schema";
  import type { LazyEntry } from "#lib/utils/lazyMap";
  import { t } from "#lib/i18n";
  import { exerciseHref } from "#lib/utils/links";
  import { fmt } from "#lib/utils/format";
  import { examNavItems } from "#lib/components/layout/examNavItems";
  import { faCopy, faEye, faFileZipper, faTrash } from "@fortawesome/free-solid-svg-icons";
  import { Button, Card, EmptyState, ExpandableCard } from "#lib/components/ui";
  import ExamSummary from "#lib/components/exam/ExamSummary.svelte";
  import ExercisePreviewDrawer from "#lib/components/exercise-library/ExercisePreviewDrawer.svelte";
  import type { ExamLogoPreview } from "#lib/latex/logo";

  interface Props {
    exams: ExamRecord[];
    examStatsMap: Map<string, { avgScore: number | null; count: number }>;
    /** Lazily loaded per exam on first expand; absent = not requested yet. */
    exerciseMap?: Map<string, LazyEntry<ExerciseRecord[]>>;
    /** The header logo per exam, loaded on first expand like the exercises. */
    logoMap?: Map<string, LazyEntry<ExamLogoPreview>>;
    isLoading?: boolean;
    expandedExams?: { [examId: string]: boolean };
    onToggleExam: (examId: string) => void;
    onDelete: (id: string, title?: string) => void;
    onPreview: (exam: ExamRecord) => void;
    onRawExport: (exam: ExamRecord) => void;
    onDuplicate: (exam: ExamRecord) => void;
    /** The exam currently being duplicated (its button shows a spinner). */
    duplicatingId?: string | null;
  }

  let {
    exams,
    examStatsMap,
    exerciseMap = new Map(),
    logoMap = new Map(),
    isLoading = false,
    expandedExams = {},
    onToggleExam,
    onDelete,
    onPreview,
    onRawExport,
    onDuplicate,
    duplicatingId = null
  }: Props = $props();

  const previewPill = "rounded-xl border border-line bg-surface-sunken px-2.5 py-1 text-xs text-muted";
  let previewEx = $state.raw<ExerciseRecord | null>(null);
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
      {@const isExpanded = !!expandedExams[exam.id]}
      <ExpandableCard
        title={exam.title || $t("dashboard.examList.untitledExam")}
        expanded={isExpanded}
        onToggle={() => onToggleExam(exam.id)}
      >
        {#snippet badges()}
          <ExamSummary {exam} {stats} part="badges" />
        {/snippet}

        {#snippet preview()}
          {#if exam.datum || exam.createdAt}
            <span class={previewPill}>{exam.datum || $fmt.date(exam.createdAt)}</span>
          {/if}
        {/snippet}

        {#snippet body()}
          <ExamSummary
            {exam}
            exercises={exerciseMap.get(exam.id)}
            logo={logoMap.get(exam.id)}
            onOpenExercise={(ex) => (previewEx = ex)}
          >
            {#snippet actions()}
              {#each examNavItems(exam.id, "") as item (item.step)}
                <Button href={item.href} variant="outlined" severity="secondary" size="sm" icon={item.icon}>
                  {$t(item.labelKey)}
                </Button>
              {/each}
            {/snippet}
          </ExamSummary>
        {/snippet}

        {#snippet footer()}
          <Button variant="outlined" severity="secondary" size="sm" icon={faEye} onClick={() => onPreview(exam)}>{$t("common.preview")}</Button>
          <Button variant="outlined" severity="secondary" size="sm" icon={faFileZipper} onClick={() => onRawExport(exam)}>{$t("export.button")}</Button>
          <Button
            variant="outlined"
            severity="secondary"
            size="sm"
            icon={faCopy}
            loading={duplicatingId === exam.id}
            disabled={!!duplicatingId}
            title={$t("dashboard.examList.duplicateHint")}
            onClick={() => onDuplicate(exam)}
          >{$t("common.duplicate")}</Button>
          <Button href="/exam/{exam.id}" size="sm">{$t("dashboard.examList.openExam")}</Button>
          <Button
            variant="outlined"
            severity="danger"
            size="sm"
            icon={faTrash}
            onClick={() => onDelete(exam.id, exam.title)}
          >{$t("common.delete")}</Button>
        {/snippet}
      </ExpandableCard>
    {/each}
  </div>
{/if}

{#if previewEx}
  <ExercisePreviewDrawer previewModalEx={previewEx} newTabHref={exerciseHref(previewEx.id)} onClose={() => (previewEx = null)} />
{/if}
