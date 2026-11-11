<script lang="ts">
  import type { ExamRecord, ExerciseRecord } from "#lib/db/schema";
  import type { LazyEntry } from "#lib/utils/lazyMap";
  import { t } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { EXAM_STEPS, examStepHref, type ExamStep } from "#lib/components/layout/examNavItems";
  import ExamStepLinks from "#lib/components/exam/ExamStepLinks.svelte";
  import { continueStep, examProgress, type ExamProgress } from "#lib/exam/examProgress";
  import type { ExamStats } from "#lib/utils/examStats";
  import { faEye } from "@fortawesome/free-solid-svg-icons";
  import { Button, Card, EmptyState, ExpandableCard, Menu, MenuItem, actionIcons } from "#lib/components/ui";
  import ExamSummary from "#lib/components/exam/ExamSummary.svelte";
  import ExerciseEditorModal from "#lib/components/ExerciseEditorModal.svelte";
  import type { ExamLogoPreview } from "#lib/latex/logo";

  interface Props {
    exams: ExamRecord[];
    examStatsMap: Map<string, ExamStats>;
    /** Students per exam; an exam without an entry has none, unless `statsKnown` is false. */
    studentCounts?: Map<string, number>;
    /** False when the submissions could not be read: the progress row then shows nothing it does not know. */
    statsKnown?: boolean;
    /** Lazily loaded per exam on first expand; absent = not requested yet. */
    exerciseMap?: Map<string, LazyEntry<ExerciseRecord[]>>;
    /** The header logo per exam, loaded on first expand like the exercises. */
    logoMap?: Map<string, LazyEntry<ExamLogoPreview>>;
    isLoading?: boolean;
    expandedExams?: { [examId: string]: boolean };
    onToggleExam: (examId: string) => void;
    onDelete: (exam: ExamRecord) => void;
    /** List selection (issue #261); without `onSelect` the cards have no checkbox. */
    isSelected?: (examId: string) => boolean;
    onSelect?: (examId: string, on: boolean) => void;
    onPreview: (exam: ExamRecord) => void;
    onExport: (exam: ExamRecord) => void;
    onDuplicate: (exam: ExamRecord) => void;
    /** An exercise was edited from its name; the expanded lists reload. */
    onExerciseSaved?: () => void;
    /** The exam currently being duplicated (its button shows a spinner). */
    duplicatingId?: string | null;
  }

  let {
    exams,
    examStatsMap,
    studentCounts = new Map(),
    statsKnown = true,
    exerciseMap = new Map(),
    logoMap = new Map(),
    isLoading = false,
    expandedExams = {},
    onToggleExam,
    onDelete,
    isSelected = () => false,
    onSelect,
    onPreview,
    onExport,
    onDuplicate,
    onExerciseSaved,
    duplicatingId = null
  }: Props = $props();

  const previewPill = "rounded-xl border border-line bg-surface-sunken px-2.5 py-1 text-xs text-muted";
  let editEx = $state.raw<ExerciseRecord | null>(null);

  // The same cheap statuses as the exam sidebar (issue #212); exercises are known once the card was expanded.
  function progressOf(exam: ExamRecord): ExamProgress {
    const stats = examStatsMap.get(exam.id);
    const exercises = exerciseMap.get(exam.id);
    return examProgress({
      exerciseCount: exercises?.status === "ready" ? exercises.value.length : undefined,
      studentCount: statsKnown ? (studentCounts.get(exam.id) ?? 0) : undefined,
      submissionCount: statsKnown ? (stats?.submissionCount ?? 0) : undefined,
      gradedCount: statsKnown ? (stats?.count ?? 0) : undefined,
    });
  }
  const stepEntry = (step: ExamStep) => EXAM_STEPS.find((s) => s.step === step)!;
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
        selected={isSelected(exam.id)}
        onSelect={onSelect ? (on) => onSelect(exam.id, on) : undefined}
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
            onOpenExercise={(ex) => (editEx = ex)}
          >
            {#snippet actions()}
              {@const progress = progressOf(exam)}
              {@const next = continueStep(progress)}
              <ExamStepLinks examId={exam.id} {progress} />
              <Button href={examStepHref(exam.id, next)} size="sm" iconRight={actionIcons.next}>
                {$t("exam.flow.continue", { step: $t(stepEntry(next).labelKey) })}
              </Button>
            {/snippet}
          </ExamSummary>
        {/snippet}

        {#snippet footer()}
          <Button href="/exam/{exam.id}" variant="outlined" severity="secondary" size="sm">{$t("dashboard.examList.openExam")}</Button>
          <Button variant="outlined" severity="secondary" size="sm" icon={faEye} onClick={() => onPreview(exam)}>{$t("common.preview")}</Button>
          <Menu label={$t("exam.overview.more")} icon={actionIcons.more} align="end">
            {#snippet children({ close })}
              <MenuItem icon={actionIcons.export} onSelect={() => { close(); onExport(exam); }}>{$t("exam.overview.backup")}</MenuItem>
              <MenuItem icon={actionIcons.duplicate} disabled={!!duplicatingId} onSelect={() => { close(); onDuplicate(exam); }}>
                {duplicatingId === exam.id ? $t("dashboard.examList.duplicating") : $t("common.duplicate")}
              </MenuItem>
              <MenuItem icon={actionIcons.delete} danger onSelect={() => { close(); onDelete(exam); }}>{$t("common.delete")}</MenuItem>
            {/snippet}
          </Menu>
        {/snippet}
      </ExpandableCard>
    {/each}
  </div>
{/if}

{#if editEx}
  <ExerciseEditorModal isOpen editingExercise={editEx} onClose={() => (editEx = null)} onSave={() => onExerciseSaved?.()} />
{/if}
