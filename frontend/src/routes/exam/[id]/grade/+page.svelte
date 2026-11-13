<script lang="ts">
  import { beforeNavigate, goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount, onDestroy } from "svelte";
  import { db } from "#lib/db/db";
  import type {
    SubmissionRecord,
    ExerciseRecord,
    ExerciseScoreRecord,
    ExamRecord,
  } from "#lib/db/schema";
  import { scoreRepository } from "#lib/repositories/scoreRepository";
  import {
    loadExamEncrypted,
    loadExamExercisesEncrypted,
    openAnnotation,
    sealAnnotation,
  } from "#lib/db/dbEncryption";
  import { calculateGradeDetail } from "#lib/analytics/gradingKey";
  import { submissionRepository } from "#lib/repositories/submissionRepository";
  import { sessionStore, isUnlocked, awaitSessionReady } from "#lib/stores/session";
  import { get } from "svelte/store";
  import { gradingStore, type VectorStroke } from "#lib/grading/gradingStore";
  import { isMcQuestion } from "#lib/grading/mcScore";
  import { saveSubmissionScores } from "#lib/grading/scoreService";
  import { buildGradingSheet } from "#lib/grading/gradingSheet";
  import GradingWorkspace from "#lib/components/grading/GradingWorkspace.svelte";
  import { loadScoreBoxContext, type ScoreBoxContext } from "#lib/grading/scoreBoxes";
  import { t, translate } from "#lib/i18n";
  import { Alert, Button, EmptyState } from "#lib/components/ui";
  import { createAutosave } from "#lib/utils/autosave";

  interface Props {
    params?: Record<string, string>;
  }

  let { params }: Props = $props();

  const examId = page.params.id || "";

  // Raw: these records go straight back to repositories (currentSub is saved as-is).
  let exam = $state.raw<ExamRecord | null>(null);
  let submissions: SubmissionRecord[] = $state.raw([]);
  let exercises: ExerciseRecord[] = $state.raw([]);
  /** Printed score boxes the viewer fills in (issue #187); null when the exam has no usable layout. */
  let scoreBoxes: ScoreBoxContext | null = $state.raw(null);

  let currentIndex = $derived($gradingStore.currentIndex);
  let currentSub = $derived(submissions[currentIndex]);
  let scoreInputs = $derived($gradingStore.scoreInputs);

  let gradedCount = $derived(
    exercises.filter((ex) => scoreInputs[ex.id] !== null && scoreInputs[ex.id] !== undefined).length
  );
  let isFullyGraded = $derived(exercises.length > 0 && gradedCount === exercises.length);
  let sumGradedScores = $derived(
    Math.round(exercises.reduce((sum, ex) => sum + (scoreInputs[ex.id] ?? 0), 0) * 100) / 100
  );
  let totalScore = $derived(isFullyGraded ? sumGradedScores : undefined);

  let totalMaxPoints = $derived(exercises.reduce((sum, ex) => sum + (ex.maxPoints || 0), 0));
  let calculatedGradeDetail = $derived(
    isFullyGraded && totalScore !== undefined
      ? calculateGradeDetail(totalScore, totalMaxPoints, exam?.gradingKey)
      : null
  );
  let calculatedGrade = $derived(
    calculatedGradeDetail
      ? { grade: calculatedGradeDetail.grade, label: calculatedGradeDetail.label }
      : null
  );

  onMount(async () => {
    await awaitSessionReady();
    if (!examId) return;
    if (!get(isUnlocked)) {
      await goto("/unlock");
      return;
    }
    const key = get(sessionStore).sessionKey;
    exam = (await loadExamEncrypted(examId, key)) || null;
    exercises = await loadExamExercisesEncrypted(examId, key);
    if (exercises.length > 0 && !get(gradingStore).activeExerciseId) {
      gradingStore.setActiveExerciseId(exercises[0].id);
    }
    void loadScoreBoxContext(examId, key).then((ctx) => (scoreBoxes = ctx));
    try {
      submissions = await submissionRepository.getByExamId(examId, key);
    } catch (err) {
      // An empty list would read as "no submissions for this exam".
      submissionsLoadError = translate("grading.page.submissionsLoadFailed", {
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }
    const targetId = page.url.searchParams.get('submissionId');
    if (targetId) {
      const idx = submissions.findIndex((s) => s.id === targetId);
      if (idx >= 0) gradingStore.setCurrentIndex(idx);
    }
    const targetExerciseId = page.url.searchParams.get('exerciseId');
    if (targetExerciseId && exercises.some((e) => e.id === targetExerciseId)) {
      gradingStore.setActiveExerciseId(targetExerciseId);
    }
    if (submissions.length > 0) {
      await initExerciseScores(submissions[get(gradingStore).currentIndex]);
    }
  });

  /** Grading saves itself a few seconds after the last edit (issue #233): small, frequent saves lose little on a disruption. */
  const GRADING_AUTOSAVE_MS = 3000;
  const autosave = createAutosave({ run: saveCurrent, delayMs: GRADING_AUTOSAVE_MS });
  /** Bumped per edit, so a save marks clean only when nothing changed while it ran. */
  let editRev = 0;
  /** Set once the page is gone: a queued re-run must not save the reset store over the last student. */
  let disposed = false;
  let switching = false;

  const hasUnsaved = () => autosave.busy || get(gradingStore).isDirty;

  // Every edit (strokes, scores, parts, MC, overrides) while dirty schedules a save; loads change these while clean and schedule nothing.
  let lastEdit: unknown[] = [];
  const stopEditWatch = gradingStore.subscribe((s) => {
    const edit = [s.isDirty, s.currentStrokes, s.scoreInputs, s.partInputs, s.mcState, s.manualOverride];
    const changed = edit.some((v, i) => v !== lastEdit[i]);
    lastEdit = edit;
    if (s.isDirty && changed) {
      editRev++;
      autosave.schedule();
    }
  });

  // A tablet switching apps may never come back: save what is there.
  function onVisibilityChange() {
    if (document.visibilityState === "hidden" && hasUnsaved()) void autosave.flush();
  }
  onMount(() => {
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  });

  // Leaving the page waits for the save; closing the tab asks while one is still open.
  let leaving = false;
  beforeNavigate((nav) => {
    if (leaving || !hasUnsaved()) return;
    if (nav.type === "leave") {
      void autosave.flush();
      nav.cancel();
      return;
    }
    const target = nav.to?.url;
    if (!target) return;
    nav.cancel();
    void autosave.flush().then(() => {
      if (get(autosave).state === "error" && !confirm(translate("common.unsavedChangesConfirm"))) return;
      leaving = true;
      void goto(target);
    });
  });

  onDestroy(() => {
    stopEditWatch();
    // The flush takes its snapshot synchronously, before the reset below.
    if (hasUnsaved()) void autosave.flush();
    disposed = true;
    gradingStore.reset();
  });

  async function initExerciseScores(sub: SubmissionRecord) {
    // Overlapping loads (fast Next clicks) must not let an older one win.
    const seq = ++loadSeq;
    loadedFor = null;
    gradingStore.setManualOverride({});
    gradingStore.setScoreInputs({});
    gradingStore.setPartInputs({});
    gradingStore.setMcState({});
    gradingStore.markClean();
    if (exercises.length > 0 && !get(gradingStore).activeExerciseId) {
      gradingStore.setActiveExerciseId(exercises[0].id);
    }
    const key = get(sessionStore).sessionKey;
    scoresLoadError = "";
    let existingScores: ExerciseScoreRecord[];
    try {
      existingScores = await scoreRepository.getBySubmissionId(examId, sub.id, key);
    } catch (err) {
      if (seq !== loadSeq) return;
      // Saving now would read every stored score as ungraded and delete it: block until a reload works.
      loadedScores = new Map();
      scoresLoadError = err instanceof Error ? err.message : String(err);
      return;
    }
    if (seq !== loadSeq) return;

    // Check strokes/annotations for exercises with active stamps. Read them from `sub` itself: the canvas loads the new submission's strokes asynchronously, so the store still holds the previous student's strokes at this point.
    let subStrokes: VectorStroke[];
    try {
      subStrokes = await loadStrokesFor(sub);
    } catch (err) {
      if (seq !== loadSeq) return;
      console.error("[grade] annotations did not open:", err);
      loadedScores = new Map();
      scoresLoadError = translate("grading.page.annotationsUnreadable");
      return;
    }
    if (seq !== loadSeq) return;

    const sheet = buildGradingSheet(sub.id, existingScores, exercises, subStrokes);
    loadedScores = sheet.loadedScores;
    loadedFor = sub.id;
    // Typed scores are not stored as such; flag them so the viewer's recalculation keeps them.
    gradingStore.setManualOverride(sheet.manualOverride);
    gradingStore.setScoreInputs(sheet.scoreInputs);
    gradingStore.setPartInputs(sheet.partInputs);
    gradingStore.setMcState(sheet.mcState);
    // Edits made while the scores loaded could not save yet (scoresNotLoaded): save them now.
    if (get(gradingStore).isDirty) autosave.schedule();
  }

  /** Score rows as loaded for the current submission — lets a save keep an MC row it would otherwise have deleted (see saveCurrent). */
  let loadedScores = new Map<string, ExerciseScoreRecord>();
  /** Submission the loaded sheet belongs to; a save under any other id is refused (issue #85). */
  let loadedFor: string | null = null;
  let loadSeq = 0;
  /** Set when the current submission's scores failed to load; saving is refused meanwhile. */
  let scoresLoadError = $state("");
  /** Set when the submission list failed to load: shown instead of the "no submissions" text. */
  let submissionsLoadError = $state("");

  /** @throws when the stored layer does not open: reading it as "no strokes" would let a save drop stamp-derived scores. */
  async function loadStrokesFor(sub: SubmissionRecord): Promise<VectorStroke[]> {
    const { sessionKey, fallbackSessionKey } = get(sessionStore);
    if (!sub.annotationCt || !sub.annotationIv || !sessionKey) return [];
    const bytes = await openAnnotation(sub.id, sub.annotationCt, sub.annotationIv, sessionKey, fallbackSessionKey);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function handleSubmissionHydrated(fullSub: SubmissionRecord) {
    const next = [...submissions];
    next[currentIndex] = fullSub;
    submissions = next;
  }

  /** Saves the current student's annotations and scores; throws for the autosave's status line. */
  async function saveCurrent() {
    if (disposed || !currentSub) return;
    const rev = editRev;
    // Snapshot everything this save writes: Next/Prev during the awaits below must not send the rest of the save (deletes, annotations, total) to the next student.
    const sub = currentSub;
    const { currentStrokes: strokes, strokesSubmissionId } = get(gradingStore);
    // Strokes still from the previous student (scan not loaded yet) must neither be written here nor clear this student's own annotations: leave the annotation layer untouched.
    const ownsStrokes = strokesSubmissionId === sub.id;
    const values = new Map(exercises.map((ex) => [ex.id, scoreInputs[ex.id] ?? null]));
    const mcState = get(gradingStore).mcState;
    const mc = Object.fromEntries(exercises.filter(isMcQuestion).map((ex) => [ex.id, mcState[ex.id]]));
    const parts = get(gradingStore).partInputs;

    if (scoresLoadError) {
      throw new Error(translate("grading.page.scoresLoadFailed", { message: scoresLoadError }));
    }
    if (loadedFor !== sub.id) {
      throw new Error(translate("grading.page.scoresNotLoaded"));
    }
    // Encrypt annotations. "No strokes" and "no key" differ: saving without a session key must refuse, not silently clear the teacher's corrections.
    let clearAnnotations = false;
    if (!$sessionStore.sessionKey) {
      throw new Error(
        "Cannot save grading without a session key — unlock the session and try again.",
      );
    }
    if (ownsStrokes && strokes.length > 0) {
      const annJson = JSON.stringify(strokes);
      const encAnn = await sealAnnotation(sub.id, new TextEncoder().encode(annJson), $sessionStore.sessionKey);
      sub.annotationCt = encAnn.ct;
      sub.annotationIv = encAnn.iv;
      sub.hasAnnotations = true;
    } else if (ownsStrokes && (sub.annotationCt || sub.hasAnnotations)) {
      // Only a stored layer is cleared: every autosave of a mark-free student would otherwise put an empty entry into the trash.
      sub.annotationCt = undefined;
      sub.annotationIv = undefined;
      sub.hasAnnotations = false;
      clearAnnotations = true;
    }

    // One path for rows, total and the all-server total (M2); OMR rows are carried forward, never cleared.
    await saveSubmissionScores(
      examId,
      sub,
      exercises.map((ex) => ex.id),
      values,
      { mc, existing: loadedScores, clearAnnotations, parts },
    );
    submissions = submissions.map((s) => (s.id === sub.id ? { ...sub } : s));
    // An edit made while this save ran is saved by the autosave's next run.
    if (currentSub?.id === sub.id && rev === editRev) gradingStore.markClean();
  }

  /** Saves before a student switch; false keeps the current student (a failed save the teacher did not want to drop). */
  async function settleBeforeSwitch(confirmKey: "grading.page.unsavedNext" | "grading.page.unsavedPrev"): Promise<boolean> {
    if (!hasUnsaved()) return true;
    await autosave.flush();
    return get(autosave).state !== "error" || confirm(translate(confirmKey));
  }

  async function nextStudent() {
    if (switching) return;
    switching = true;
    try {
      if (!(await settleBeforeSwitch("grading.page.unsavedNext"))) return;
      if (currentIndex >= submissions.length - 1) {
        gradingStore.setShowLastSubModal(true);
        return;
      }
      // currentIndex derives from the store and changes on set: compute the target once.
      const target = currentIndex + 1;
      gradingStore.setCurrentIndex(target);
      void initExerciseScores(submissions[target]);
    } finally {
      switching = false;
    }
  }

  async function prevStudent() {
    if (switching || currentIndex <= 0) return;
    switching = true;
    try {
      if (!(await settleBeforeSwitch("grading.page.unsavedPrev"))) return;
      const target = currentIndex - 1;
      gradingStore.setCurrentIndex(target);
      void initExerciseScores(submissions[target]);
    } finally {
      switching = false;
    }
  }

  function stayOnLastSub() {
    gradingStore.setShowLastSubModal(false);
  }

  async function retryScoresLoad() {
    if (!currentSub) return;
    // The reload resets the inputs; unsaved strokes stay, so keep the unsaved-changes prompt armed.
    const wasDirty = get(gradingStore).isDirty;
    await initExerciseScores(currentSub);
    if (wasDirty) gradingStore.markDirty();
  }
</script>

<div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-base text-content">
  {#if submissionsLoadError}
    <Alert severity="danger" class="m-3 shrink-0">{submissionsLoadError}</Alert>
  {:else if submissions.length === 0}
    <EmptyState level="h1" title={$t("grading.page.empty")} class="py-16" />
  {:else}
    {#if scoresLoadError}
      <Alert severity="danger" class="m-3 shrink-0">
        {$t("grading.page.scoresLoadFailed", { message: scoresLoadError })}
        {#snippet actions()}
          <Button variant="outlined" severity="danger" size="sm" onClick={retryScoresLoad}>
            {$t("common.retry")}
          </Button>
        {/snippet}
      </Alert>
    {/if}
    <GradingWorkspace
      {examId}
      {exam}
      {submissions}
      {exercises}
      {currentIndex}
      {currentSub}
      {calculatedGrade}
      {calculatedGradeDetail}
      {isFullyGraded}
      {totalScore}
      {sumGradedScores}
      {gradedCount}
      {totalMaxPoints}
      onSubmissionHydrated={handleSubmissionHydrated}
      saveStatus={$autosave}
      onPrev={prevStudent}
      onNext={nextStudent}
      onStayOnLastSub={stayOnLastSub}
      {scoreBoxes}
    />
  {/if}
</div>
