<script lang="ts">
  import { goto } from "$app/navigation";
  import "./+page.css";
  import { page } from "$app/stores";
  export let params;
  import { onMount, onDestroy } from "svelte";
  import { db } from "$lib/db/db";
  import type {
    SubmissionRecord,
    ExerciseRecord,
    ExerciseScoreRecord,
    ExamRecord,
    OmrScoreMeta,
  } from "$lib/db/schema";
  import { scoreRepository } from "$lib/repositories/scoreRepository";
  import {
    loadExamEncrypted,
    loadExamExercisesEncrypted,
    saveSubmissionEncrypted,
  } from "$lib/db/dbEncryption";
  import { calculateGradeDetail } from "$lib/analytics/gradingKey";
  import { api } from "$lib/api/client";
  import { submissionRepository } from "$lib/repositories/submissionRepository";
  import { sessionStore, isUnlocked, awaitSessionReady } from "$lib/stores/session";
  import { storagePolicyStore } from "$lib/stores/storagePolicy";
  import { decrypt, encrypt } from "$lib/crypto/aesGcm";
  import { get } from "svelte/store";
  import { gradingStore } from "$lib/grading/gradingStore";
  import { isMcQuestion } from "$lib/grading/mcScore";
  import GradingWorkspace from "$lib/components/grading/GradingWorkspace.svelte";
  import { t, translate } from "$lib/i18n";

  const examId = $page.params.id || "";

  let exam: ExamRecord | null = null;
  let submissions: SubmissionRecord[] = [];
  let exercises: ExerciseRecord[] = [];

  $: currentIndex = $gradingStore.currentIndex;
  $: currentSub = submissions[currentIndex];
  $: scoreInputs = $gradingStore.scoreInputs;

  $: gradedCount = exercises.filter(
    (ex) => scoreInputs[ex.id] !== null && scoreInputs[ex.id] !== undefined
  ).length;
  $: isFullyGraded = exercises.length > 0 && gradedCount === exercises.length;
  $: sumGradedScores = Math.round(
    exercises.reduce((sum, ex) => sum + (scoreInputs[ex.id] ?? 0), 0) * 100
  ) / 100;
  $: totalScore = isFullyGraded ? sumGradedScores : undefined;

  $: totalMaxPoints = exercises.reduce((sum, ex) => sum + (ex.maxPoints || 0), 0);
  $: calculatedGradeDetail = isFullyGraded && totalScore !== undefined
    ? calculateGradeDetail(totalScore, totalMaxPoints, exam?.gradingKey)
    : null;
  $: calculatedGrade = calculatedGradeDetail
    ? { grade: calculatedGradeDetail.grade, label: calculatedGradeDetail.label }
    : null;

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
    submissions = await submissionRepository.getByExamId(examId, key);
    const targetId = $page.url.searchParams.get('submissionId');
    if (targetId) {
      const idx = submissions.findIndex((s) => s.id === targetId);
      if (idx >= 0) gradingStore.setCurrentIndex(idx);
    }
    const targetExerciseId = $page.url.searchParams.get('exerciseId');
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
    gradingStore.setManualOverride({});
    gradingStore.setScoreInputs({});
    gradingStore.setMcState({});
    if (exercises.length > 0 && !get(gradingStore).activeExerciseId) {
      gradingStore.setActiveExerciseId(exercises[0].id);
    }
    const key = get(sessionStore).sessionKey;
    const existingScores = await scoreRepository.getBySubmissionId(examId, sub.id, key);
    const existingMap = new Map(existingScores.map((es) => [es.exerciseId, es]));

    // Check strokes/annotations for exercises with active stamps
    const currentStrokes = get(gradingStore).currentStrokes;
    const exerciseIdsWithStrokes = new Set<string>();
    if (currentStrokes && currentStrokes.length > 0) {
      for (const stroke of currentStrokes) {
        if (stroke.exerciseId) {
          exerciseIdsWithStrokes.add(stroke.exerciseId);
        }
      }
    }

    const newScoreInputs: Record<string, number | null> = {};
    const newMcState: Record<string, { selectedOptions: number[]; omrMeta?: OmrScoreMeta }> = {};
    const manualOverride = get(gradingStore).manualOverride;
    for (const ex of exercises) {
      const existing = existingMap.get(ex.id);
      if (existing && typeof existing.score === "number" && !isNaN(existing.score)) {
        // Legacy detection: if score is 0 and no annotations exist for this exercise,
        // treat as ungraded (null) instead of graded 0 points
        if (existing.score === 0 && !exerciseIdsWithStrokes.has(ex.id) && !manualOverride[ex.id]) {
          newScoreInputs[ex.id] = null;
        } else {
          newScoreInputs[ex.id] = existing.score;
        }
      } else {
        newScoreInputs[ex.id] = null;
      }
      if (isMcQuestion(ex) && existing) {
        newMcState[ex.id] = {
          selectedOptions: existing.selectedOptions ?? [],
          omrMeta: existing.omrMeta,
        };
      }
    }
    gradingStore.setScoreInputs(newScoreInputs);
    gradingStore.setMcState(newMcState);
  }

  function handleSubmissionHydrated(fullSub: SubmissionRecord) {
    submissions[currentIndex] = fullSub;
    submissions = submissions;
  }

  async function handleSaveScore() {
    if (!currentSub) return;
    gradingStore.setSaving(true);

    try {
      currentSub.totalScore = isFullyGraded ? sumGradedScores : undefined;
      const key = get(sessionStore).sessionKey;

      // Save individual exercise scores if graded, delete if reset to ungraded
      const mcState = get(gradingStore).mcState;
      const toSave: ExerciseScoreRecord[] = [];
      const toClear: string[] = [];
      for (const ex of exercises) {
        const val = scoreInputs[ex.id];
        if (val !== null && val !== undefined && !isNaN(val)) {
          const mc = isMcQuestion(ex) ? mcState[ex.id] : undefined;
          toSave.push({
            id: crypto.randomUUID(),
            submissionId: currentSub.id,
            exerciseId: ex.id,
            score: val,
            selectedOptions: mc?.selectedOptions,
            omrMeta: mc?.omrMeta,
          });
        } else {
          toClear.push(ex.id);
        }
      }
      // One write for the whole sheet; the repository reconciles on
      // (submissionId, exerciseId), so no existing-row lookup is needed.
      await scoreRepository.saveMany(examId, currentSub.id, toSave, key);
      for (const exerciseId of toClear) {
        await scoreRepository.deleteOne(examId, currentSub.id, exerciseId);
      }

      // Encrypt annotations vector layer.
      //
      // "No strokes" and "no key to encrypt them with" are different answers:
      // saving without a session key must refuse, not silently clear the
      // teacher's corrections.
      const currentStrokes = get(gradingStore).currentStrokes;
      let clearAnnotations = false;
      if (!$sessionStore.sessionKey) {
        throw new Error(
          "Cannot save grading without a session key — unlock the session and try again.",
        );
      }
      if (currentStrokes.length > 0) {
        const annJson = JSON.stringify(currentStrokes);
        const encAnn = await encrypt(
          $sessionStore.sessionKey,
          new TextEncoder().encode(annJson),
        );
        currentSub.annotationCt = encAnn.ciphertext;
        currentSub.annotationIv = encAnn.iv;
      } else {
        currentSub.annotationCt = undefined;
        currentSub.annotationIv = undefined;
        clearAnnotations = true;
      }

      await submissionRepository.save(currentSub, key, { clearAnnotations });
      submissions[currentIndex] = { ...currentSub };
      submissions = submissions;

      if ($storagePolicyStore.storageMode === "all-server") {
        await api.patch(`/exams/${examId}/submissions/${currentSub.id}/score`, {
          total_score: isFullyGraded ? sumGradedScores : null,
        });
      }
      sessionStore.setDirty(false);
      alert(translate("grading.page.saveSuccess"));
    } catch (err: any) {
      alert(translate("grading.page.saveFailed", { message: err.message }));
    } finally {
      gradingStore.setSaving(false);
    }
  }

  function nextStudent() {
    if (currentIndex >= submissions.length - 1) {
      gradingStore.setShowLastSubModal(true);
      return;
    }
    if (get(gradingStore).currentStrokes.length > 0) {
      if (!confirm(translate("grading.page.unsavedNext"))) {
        return;
      }
    }
    gradingStore.setCurrentIndex(currentIndex + 1);
    initExerciseScores(submissions[currentIndex + 1]);
  }

  function prevStudent() {
    if (get(gradingStore).currentStrokes.length > 0) {
      if (!confirm(translate("grading.page.unsavedPrev"))) {
        return;
      }
    }
    if (currentIndex > 0) {
      gradingStore.setCurrentIndex(currentIndex - 1);
      initExerciseScores(submissions[currentIndex - 1]);
    }
  }

  function stayOnLastSub() {
    gradingStore.setShowLastSubModal(false);
  }
</script>

<div class="grading-page">
  {#if submissions.length === 0}
    <div class="exam-grade-empty">{$t("grading.page.empty")}</div>
  {:else}
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
    />
  {/if}
</div>
