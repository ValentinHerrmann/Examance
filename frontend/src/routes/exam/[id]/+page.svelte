<script lang="ts">
  // The exam's Overview (issue #212): its details, the key figures the step badges don't show, the linked workflow, the exam-wide actions and "Continue" into the next unfinished step. Navigation lives in the sidebar only.
  import { page } from "$app/state";
  import { untrack } from "svelte";
  import { browser } from "$app/env";
  import { beforeNavigate, goto } from "$app/navigation";
  import { get } from "svelte/store";
  import type { ExamRecord, ExerciseRecord, SubmissionRecord } from "#lib/db/schema";
  import { loadExamEncrypted, loadExamExercisesEncrypted } from "#lib/db/dbEncryption";
  import { loadExamSubmissions } from "#lib/exam/loadExam";
  import { continueStep } from "#lib/exam/examProgress";
  import { EXAM_STEPS, examStepHref } from "#lib/components/layout/examNavItems";
  import { submissionRepository } from "#lib/repositories/submissionRepository";
  import { studentRepository } from "#lib/repositories/studentRepository";
  import { examRepository } from "#lib/repositories/examRepository";
  import { newTrashGroup } from "#lib/trash/group";
  import { TRASH_DAYS } from "#lib/trash/localTrash";
  import { sessionStore, awaitSessionReady } from "#lib/stores/session";
  import { examNavContext } from "#lib/stores/shell";
  import { examCourse } from "#lib/utils/examLabel";
  import { computeExamStats } from "#lib/utils/examStats";
  import { fmt } from "#lib/utils/format";
  import ExamDetailsForm from "#lib/components/exam/ExamDetailsForm.svelte";
  import ExamExportModal from "#lib/components/exam/ExamExportModal.svelte";
  import ExamPageHeader from "#lib/components/exam/ExamPageHeader.svelte";
  import ExamStepLinks from "#lib/components/exam/ExamStepLinks.svelte";
  import InfoTip from "#lib/components/help/InfoTip.svelte";
  import { t, translate, type TranslationKey } from "#lib/i18n";
  import { Alert, Button, Card, ConfirmDialog, Menu, MenuItem, PageShell, SaveStatus, actionIcons } from "#lib/components/ui";
  import { IDLE_SAVE, type AutosaveStatus } from "#lib/utils/autosave";

  let examId = $derived(page.params.id || "");

  let exam = $state.raw<ExamRecord | null>(null);
  let exercises: ExerciseRecord[] = $state.raw([]);
  let submissions: SubmissionRecord[] = $state.raw([]);
  // Set when the submission read failed: counts show "–" and "delete all" is off, never "no submissions".
  let submissionsLoadError = $state("");
  let loadError = $state("");
  let notice = $state("");
  let actionError = $state("");

  let detailsDirty = $state(false);
  let detailsStatus = $state<AutosaveStatus>(IDLE_SAVE);
  let pendingLeave: URL | null = $state(null);
  let exportOpen = $state(false);
  let confirming: "exam" | "submissions" | null = $state(null);
  let busy = $state(false);
  let isDuplicating = $state(false);

  let loadSeq = 0;
  async function load(id: string) {
    await awaitSessionReady();
    const seq = ++loadSeq;
    const isStale = () => seq !== loadSeq;
    const key = get(sessionStore).sessionKey;
    loadError = "";
    try {
      const record = (await loadExamEncrypted(id, key)) || null;
      const exs = await loadExamExercisesEncrypted(id, key);
      if (isStale()) return;
      exam = record;
      exercises = exs;
      if (!record) loadError = translate("exam.page.examNotFoundOrDeleted");
    } catch (err) {
      if (!isStale()) loadError = err instanceof Error ? err.message : String(err);
    }
    const loaded = await loadExamSubmissions(id, key, isStale);
    if (!loaded) return;
    submissions = loaded.submissions;
    submissionsLoadError = loaded.error;
  }

  let totalPoints = $derived(exercises.reduce((sum, ex) => sum + (ex.maxPoints ?? 0), 0));
  let stats = $derived(computeExamStats(submissions).get(examId));
  let progress = $derived($examNavContext?.examId === examId ? $examNavContext.progress : {});
  let next = $derived(continueStep(progress));
  let nextLabel = $derived(EXAM_STEPS.find((s) => s.step === next)?.labelKey);
  let course = $derived(exam ? examCourse(exam) : "");
  let subtitle = $derived(exam ? [exam.testart, [course, exam.fach].filter(Boolean).join(", "), exam.datum].filter(Boolean).join(" · ") : "");

  const GRADING_KEY_LABELS: Record<string, TranslationKey> = {
    linear_50: "exam.metadata.gradeType.linear50",
    linear_40: "exam.metadata.gradeType.linear40",
    even_split: "exam.metadata.gradeType.even",
  };
  let gradingKeyLabel = $derived(
    exam?.gradingKey ? $t(GRADING_KEY_LABELS[exam.gradingKey.preset] ?? "exam.metadata.gradeType.custom") : null,
  );


  const missing = (value: number | null | undefined) => (value === null || value === undefined ? $t("exam.overview.noValue") : String(value));

  let figures = $derived([
    ["common.points", String(totalPoints)],
    ["exam.overview.average", stats?.avgScore != null ? $fmt.number(stats.avgScore) : missing(null)],
    ["exam.overview.gradingKey", gradingKeyLabel ?? missing(null)],
  ] as [TranslationKey, string][]);

  async function deleteExam() {
    if (!exam) return;
    busy = true;
    actionError = "";
    try {
      // One cascade, shared with the dashboard and the repository, so no owned table is missed.
      await examRepository.delete(exam.id);
      window.location.href = "/";
    } catch (err: any) {
      actionError = translate("exam.page.delete.failed", { message: err.message });
    } finally {
      busy = false;
    }
  }

  async function deleteAllSubmissions() {
    if (!exam || submissionsLoadError) return;
    busy = true;
    actionError = "";
    try {
      // One trash entry for the whole action (issue #125).
      const group = newTrashGroup();
      for (const sub of submissions) {
        await submissionRepository.delete(exam.id, sub.id, { group });
        await studentRepository.delete(sub, { group });
      }
      submissions = await submissionRepository.getByExamId(exam.id, get(sessionStore).sessionKey);
      confirming = null;
      notice = translate("exam.page.submissions.allDeleted");
    } catch (err: any) {
      actionError = translate("exam.page.submissions.deleteFailed", { message: err.message });
    } finally {
      busy = false;
    }
  }

  /** A copy with the same exercises and settings but no results (issue #121), opened right away. */
  async function duplicateExam() {
    if (!exam) return;
    isDuplicating = true;
    notice = "";
    try {
      const copy = await examRepository.duplicate(exam.id);
      await goto(`/exam/${copy.id}`);
    } catch (err: any) {
      loadError = translate("dashboard.duplicateFailed", { message: err?.message ?? "" });
    } finally {
      isDuplicating = false;
    }
  }

  // Unsaved detail edits: ask before leaving the page (in-app navigation).
  beforeNavigate((nav) => {
    if (!detailsDirty || !nav.to || nav.type === "leave") return;
    nav.cancel();
    pendingLeave = nav.to.url;
  });

  $effect.pre(() => {
    const id = examId;
    if (browser && id) untrack(() => void load(id));
  });
</script>

<PageShell width="fluid">
  <ExamPageHeader {examId} step="overview" title={$t("exam.sidebar.overview")} hint={subtitle || undefined} next={false}>
    {#snippet actions()}
      {#if exam}
        <span class="inline-flex items-center gap-1">
          <Button size="sm" variant="outlined" severity="secondary" icon={actionIcons.export} onClick={() => (exportOpen = true)}>
            {$t("exam.overview.backup")}
          </Button>
          <InfoTip text={$t("exam.overview.backupHint")} />
        </span>
        <Menu label={$t("exam.overview.more")} icon={actionIcons.more} align="end">
          {#snippet children({ close })}
            <MenuItem icon={actionIcons.duplicate} disabled={isDuplicating} onSelect={() => { close(); void duplicateExam(); }}>
              {$t("common.duplicate")}
            </MenuItem>
            <MenuItem
              icon={actionIcons.delete}
              danger
              disabled={!!submissionsLoadError || submissions.length === 0}
              onSelect={() => { close(); confirming = "submissions"; }}
            >
              {$t("exam.actionBar.deleteSubmissions")}
            </MenuItem>
            <MenuItem icon={actionIcons.delete} danger onSelect={() => { close(); confirming = "exam"; }}>
              {$t("exam.actionBar.delete")}
            </MenuItem>
          {/snippet}
        </Menu>
        {#if nextLabel}
          <Button href={examStepHref(examId, next)} iconRight={actionIcons.next}>{$t("exam.flow.continue", { step: $t(nextLabel) })}</Button>
        {/if}
      {/if}
    {/snippet}
  </ExamPageHeader>

  {#if loadError}<Alert severity="danger" class="mb-6">{loadError}</Alert>{/if}
  {#if submissionsLoadError}<Alert severity="danger" class="mb-6">{submissionsLoadError}</Alert>{/if}
  {#if notice}<Alert severity="success" class="mb-6">{notice}</Alert>{/if}
  {#if exercises.some((ex) => ex.codeWithheld)}
    <!-- Imported from another teacher's results-only archive: grading and statistics work, compiling doesn't. -->
    <Alert severity="info" title={$t("exam.resultsOnly.badge")} class="mb-6">{$t("exam.resultsOnly.noCompile")}</Alert>
  {/if}

  {#if !exam && !loadError}
    <div class="text-muted">{$t("exam.page.loading")}</div>
  {:else if exam}
    <!-- The details are edited in place: the page has the room, a dialog would only hide them (issue #212). -->
    <div class="grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Card title={$t("exam.overview.details")}>
        {#snippet actions()}<SaveStatus status={detailsStatus} />{/snippet}
        <ExamDetailsForm
          {exam}
          {exercises}
          bind:dirty={detailsDirty}
          bind:status={detailsStatus}
          onSaved={(updated) => (exam = updated)}
        />
      </Card>

      <Card title={$t("exam.overview.keyFigures")}>
        <!-- Only what the workflow badges below don't already show. -->
        <dl class="m-0 grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
          {#each figures as [labelKey, value] (labelKey)}
            <div class="min-w-0 rounded-md bg-surface-inset px-3 py-2">
              <dt class="truncate text-xs text-muted">{$t(labelKey)}</dt>
              <dd class="m-0 truncate text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          {/each}
        </dl>
      </Card>

      <Card class="xl:col-span-2" title={$t("exam.overview.workflow")}>
        <ExamStepLinks {examId} {progress} layout="stepper" />
      </Card>
    </div>

  {/if}
</PageShell>

{#if exportOpen}
  <ExamExportModal {examId} examTitle={exam?.title ?? ""} onClose={() => (exportOpen = false)} />
{/if}

<ConfirmDialog
  open={pendingLeave !== null}
  title={$t("exam.overview.unsavedTitle")}
  message={$t("exam.overview.unsavedMessage")}
  confirmText={$t("exam.content.unsavedLeave")}
  cancelText={$t("exam.content.unsavedStay")}
  onConfirm={() => {
    const to = pendingLeave;
    pendingLeave = null;
    detailsDirty = false;
    if (to) void goto(to);
  }}
  onCancel={() => (pendingLeave = null)}
/>

<ConfirmDialog
  open={confirming === "exam"}
  title={$t("exam.overview.deleteTitle")}
  message={translate("exam.page.delete.confirmMessage", { title: exam?.title ?? "" }) + " " + translate("common.trashHint", { days: TRASH_DAYS })}
  confirmText={$t("exam.actionBar.delete")}
  cancelText={$t("common.cancel")}
  severity="danger"
  {busy}
  error={confirming === "exam" ? actionError : ""}
  onConfirm={deleteExam}
  onCancel={() => (confirming = null)}
/>

<ConfirmDialog
  open={confirming === "submissions"}
  title={$t("exam.overview.deleteSubmissionsTitle")}
  message={translate("exam.page.submissions.confirmDeleteAll", { count: submissions.length }) + " " + translate("common.trashHint", { days: TRASH_DAYS })}
  confirmText={$t("exam.actionBar.deleteSubmissions")}
  cancelText={$t("common.cancel")}
  severity="danger"
  {busy}
  error={confirming === "submissions" ? actionError : ""}
  onConfirm={deleteAllSubmissions}
  onCancel={() => (confirming = null)}
/>
