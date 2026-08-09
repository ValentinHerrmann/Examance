<script lang="ts">
  import "./+page.css";
  import { page } from "$app/stores";
  export let params;
  import { onMount, onDestroy } from "svelte";
  import { db } from "$lib/db/db";
  import type { SubmissionRecord, ExerciseRecord, ExamRecord } from "$lib/db/schema";
  import {
    loadExamEncrypted,
    loadExamExercisesEncrypted,
    loadScoresEncrypted,
    saveScoreEncrypted,
    deleteScoreEncrypted,
    saveSubmissionEncrypted,
  } from "$lib/db/dbEncryption";
  import { calculateGradeDetail } from "$lib/analytics/gradingKey";
  import { api } from "$lib/api/client";
  import { submissionRepository } from "$lib/repositories/submissionRepository";
  import { sessionStore, isUnlocked } from "$lib/stores/session";
  import { storagePolicyStore } from "$lib/stores/storagePolicy";
  import { decrypt, encrypt } from "$lib/crypto/aesGcm";
  import { get } from "svelte/store";
  import { gradingStore } from "$lib/grading/gradingStore";
  import GradingWorkspace from "$lib/components/grading/GradingWorkspace.svelte";

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
    if (!examId) return;
    if (!get(isUnlocked)) {
      await sessionStore.initAnonymousSession();
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
    if (exercises.length > 0 && !get(gradingStore).activeExerciseId) {
      gradingStore.setActiveExerciseId(exercises[0].id);
    }
    const key = get(sessionStore).sessionKey;
    const existingScores = await loadScoresEncrypted(sub.id, key);
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
    }
    gradingStore.setScoreInputs(newScoreInputs);
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
      for (const ex of exercises) {
        const val = scoreInputs[ex.id];
        if (val !== null && val !== undefined && !isNaN(val)) {
          const existing = await db.exerciseScores
            .where("submissionId")
            .equals(currentSub.id)
            .and((item) => item.exerciseId === ex.id)
            .first();

          await saveScoreEncrypted({
            id: existing ? existing.id : crypto.randomUUID(),
            submissionId: currentSub.id,
            exerciseId: ex.id,
            score: val,
          }, key);
        } else {
          await deleteScoreEncrypted(currentSub.id, ex.id);
        }
      }

      // Encrypt annotations vector layer
      const currentStrokes = get(gradingStore).currentStrokes;
      if ($sessionStore.sessionKey && currentStrokes.length > 0) {
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
      }

      await saveSubmissionEncrypted(currentSub, key);
      submissions[currentIndex] = { ...currentSub };
      submissions = submissions;

      if ($storagePolicyStore.storageMode === "all-server") {
        await api.patch(`/exams/${examId}/submissions/${currentSub.id}/score`, {
          total_score: isFullyGraded ? sumGradedScores : null,
        });
      }
      sessionStore.setDirty(false);
      alert("Score and annotations saved successfully!");
    } catch (err: any) {
      alert(`Failed to save score: ${err.message}`);
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
      if (!confirm("You have unsaved annotations for this student. Move to next student anyway?")) {
        return;
      }
    }
    gradingStore.setCurrentIndex(currentIndex + 1);
    initExerciseScores(submissions[currentIndex + 1]);
  }

  function prevStudent() {
    if (get(gradingStore).currentStrokes.length > 0) {
      if (!confirm("You have unsaved annotations for this student. Move to previous student anyway?")) {
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
    <div class="exam-grade-empty">No submissions to grade for this exam.</div>
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
