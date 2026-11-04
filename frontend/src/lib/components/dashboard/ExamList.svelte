<script lang="ts">
  import type { ExamRecord, ExerciseRecord } from "#lib/db/schema";
  import type { LazyEntry } from "#lib/utils/lazyMap";
  import { t } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { EXAM_STEPS, examStepHref, type ExamStep } from "#lib/components/layout/examNavItems";
  import ExamStepBadge from "#lib/components/layout/ExamStepBadge.svelte";
  import { continueStep, examProgress, type ExamProgress } from "#lib/exam/examProgress";
  import type { ExamStats } from "#lib/utils/examStats";
  import { faChevronRight, faEye } from "@fortawesome/free-solid-svg-icons";
  import { Button, Card, EmptyState, ExpandableCard, Icon, Menu, MenuItem, Tooltip, actionIcons } from "#lib/components/ui";
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
    onDelete: (id: string, title?: string) => void;
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
  // Every step of the flow is listed (unknown status = no badge), each one a link to that step.
  const ROW_STEPS: ExamStep[] = EXAM_STEPS.filter((s) => s.step !== "overview").map((s) => s.step);
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
              <ul class="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-sm text-muted" aria-label={$t("dashboard.examList.progress")}>
                {#each ROW_STEPS as step (step)}
                  {@const entry = stepEntry(step)}
                  <li class="min-w-0">
                    <Tooltip text={$t("dashboard.examList.openStep", { step: $t(entry.labelKey) })}>
                      <a
                        href={examStepHref(exam.id, step)}
                        class="group inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-muted no-underline transition-colors hover:bg-surface-sunken hover:text-accent focus-visible:bg-surface-sunken focus-visible:text-accent"
                      >
                        <Icon icon={entry.icon} class="w-3.5" />
                        <span class="group-hover:underline group-focus-visible:underline">{$t(entry.labelKey)}</span>
                        <ExamStepBadge status={progress[step]} {step} />
                        <Icon icon={faChevronRight} class="w-2.5 text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                      </a>
                    </Tooltip>
                  </li>
                {/each}
              </ul>
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
              <MenuItem icon={actionIcons.export} onSelect={() => { close(); onExport(exam); }}>{$t("common.export")}</MenuItem>
              <MenuItem icon={actionIcons.duplicate} disabled={!!duplicatingId} onSelect={() => { close(); onDuplicate(exam); }}>
                {duplicatingId === exam.id ? $t("dashboard.examList.duplicating") : $t("common.duplicate")}
              </MenuItem>
              <MenuItem icon={actionIcons.delete} danger onSelect={() => { close(); onDelete(exam.id, exam.title); }}>{$t("common.delete")}</MenuItem>
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
