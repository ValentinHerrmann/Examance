<script lang="ts">
  import { goto } from "$app/navigation";
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
  } from "#lib/db/dbEncryption";
  import { calculateGradeDetail } from "#lib/analytics/gradingKey";
  import { submissionRepository } from "#lib/repositories/submissionRepository";
  import { sessionStore, isUnlocked, awaitSessionReady } from "#lib/stores/session";
  import { decrypt, encrypt } from "#lib/crypto/aesGcm";
  import { get } from "svelte/store";
  import { gradingStore, type VectorStroke } from "#lib/grading/gradingStore";
  import { isMcQuestion } from "#lib/grading/mcScore";
  import { saveSubmissionScores } from "#lib/grading/scoreService";
  import { buildGradingSheet } from "#lib/grading/gradingSheet";
  import GradingWorkspace from "#lib/components/grading/GradingWorkspace.svelte";
  import { t, translate } from "#lib/i18n";
  import { Alert, Button, EmptyState } from "#lib/components/ui";

  interface Props {
    params?: Record<string, string>;
  }

  let { params }: Props = $props();

  const examId = page.params.id || "";

  // Raw: these records go straight back to repositories (currentSub is saved as-is).
  let exam = $state.raw<ExamRecord | null>(null);
  let submissions: SubmissionRecord[] = $state.raw([]);
  let exercises: ExerciseRecord[] = $state.raw([]);

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

  onDestroy(() => {
    gradingStore.reset();
  });

  async function initExerciseScores(sub: SubmissionRecord) {
    // Overlapping loads (fast Next clicks) must not let an older one win.
    const seq = ++loadSeq;
    loadedFor = null;
    gradingStore.setManualOverride({});
    gradingStore.setScoreInputs({});
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
    const subStrokes = await loadStrokesFor(sub);
    if (seq !== loadSeq) return;
    const exerciseIdsWithStrokes = new Set<string>();
    for (const stroke of subStrokes) {
      if (stroke.exerciseId) {
        exerciseIdsWithStrokes.add(stroke.exerciseId);
      }
    }

    const sheet = buildGradingSheet(
      sub.id,
      existingScores,
      exercises,
      exerciseIdsWithStrokes,
      get(gradingStore).manualOverride
    );
    loadedScores = sheet.loadedScores;
    loadedFor = sub.id;
    gradingStore.setScoreInputs(sheet.scoreInputs);
    gradingStore.setMcState(sheet.mcState);
  }

  /** Score rows as loaded for the current submission — lets a save keep an MC row it would otherwise have deleted (see handleSaveScore). */
  let loadedScores = new Map<string, ExerciseScoreRecord>();
  /** Submission the loaded sheet belongs to; a save under any other id is refused (issue #85). */
  let loadedFor: string | null = null;
  let loadSeq = 0;
  /** Set when the current submission's scores failed to load; saving is refused meanwhile. */
  let scoresLoadError = $state("");
  /** Set when the submission list failed to load: shown instead of the "no submissions" text. */
  let submissionsLoadError = $state("");

  async function loadStrokesFor(sub: SubmissionRecord): Promise<VectorStroke[]> {
    const { sessionKey, fallbackSessionKey } = get(sessionStore);
    if (!sub.annotationCt || !sub.annotationIv || !sessionKey) return [];
    try {
      const bytes = await decrypt(sessionKey, sub.annotationCt, sub.annotationIv, fallbackSessionKey);
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return [];
    }
  }

  function handleSubmissionHydrated(fullSub: SubmissionRecord) {
    const next = [...submissions];
    next[currentIndex] = fullSub;
    submissions = next;
  }

  async function handleSaveScore() {
    if (!currentSub) return;
    // Snapshot everything this save writes: Next/Prev during the awaits below must not send the rest of the save (deletes, annotations, total) to the next student.
    const sub = currentSub;
    const { currentStrokes: strokes, strokesSubmissionId } = get(gradingStore);
    // Strokes still from the previous student (scan not loaded yet) must neither be written here nor clear this student's own annotations: leave the annotation layer untouched.
    const ownsStrokes = strokesSubmissionId === sub.id;
    const values = new Map(exercises.map((ex) => [ex.id, scoreInputs[ex.id] ?? null]));
    const mcState = get(gradingStore).mcState;
    const mc = Object.fromEntries(exercises.filter(isMcQuestion).map((ex) => [ex.id, mcState[ex.id]]));
    gradingStore.setSaving(true);

    try {
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
        const encAnn = await encrypt(
          $sessionStore.sessionKey,
          new TextEncoder().encode(annJson),
        );
        sub.annotationCt = encAnn.ciphertext;
        sub.annotationIv = encAnn.iv;
      } else if (ownsStrokes) {
        sub.annotationCt = undefined;
        sub.annotationIv = undefined;
        clearAnnotations = true;
      }

      // One path for rows, total and the all-server total (M2); OMR rows are carried forward, never cleared.
      await saveSubmissionScores(
        examId,
        sub,
        exercises.map((ex) => ex.id),
        values,
        { mc, existing: loadedScores, clearAnnotations },
      );
      submissions = submissions.map((s) => (s.id === sub.id ? { ...sub } : s));
      if (currentSub?.id === sub.id) {
        sessionStore.setDirty(false);
        gradingStore.markClean();
      }
      alert(translate("grading.page.saveSuccess"));
    } catch (err: any) {
      alert(translate("grading.page.saveFailed", { message: err.message }));
    } finally {
      gradingStore.setSaving(false);
    }
  }

  function nextStudent() {
    if (get(gradingStore).isSaving) return;
    if (currentIndex >= submissions.length - 1) {
      gradingStore.setShowLastSubModal(true);
      return;
    }
    if (get(gradingStore).isDirty) {
      if (!confirm(translate("grading.page.unsavedNext"))) {
        return;
      }
    }
    // currentIndex derives from the store and changes on set: compute the target once.
    const target = currentIndex + 1;
    gradingStore.setCurrentIndex(target);
    initExerciseScores(submissions[target]);
  }

  function prevStudent() {
    if (get(gradingStore).isSaving) return;
    if (get(gradingStore).isDirty) {
      if (!confirm(translate("grading.page.unsavedPrev"))) {
        return;
      }
    }
    if (currentIndex > 0) {
      const target = currentIndex - 1;
      gradingStore.setCurrentIndex(target);
      initExerciseScores(submissions[target]);
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
      onSave={handleSaveScore}
      onPrev={prevStudent}
      onNext={nextStudent}
      onStayOnLastSub={stayOnLastSub}
      onExerciseSaved={async () => (exercises = await loadExamExercisesEncrypted(examId, get(sessionStore).sessionKey))}
    />
  {/if}
</div>
