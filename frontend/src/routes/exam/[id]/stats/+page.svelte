<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { get } from 'svelte/store';
  import StatsPage from '$lib/components/stats/StatsPage.svelte';
  import type { ExamRecord, ExerciseRecord, SubmissionRecord, StudentRecord } from '$lib/db/schema';
  import { loadExamEncrypted, loadExamExercisesEncrypted } from '$lib/db/dbEncryption';
  import { scoreRepository } from '$lib/repositories/scoreRepository';
  import { submissionRepository } from '$lib/repositories/submissionRepository';
  import { studentRepository } from '$lib/repositories/studentRepository';
  import { sessionStore, awaitSessionReady } from '$lib/stores/session';
  import {
    calculateSubmissionPercentage,
    calculatePercentageHistogram,
    type PercentageHistogramBin,
  } from '$lib/analytics/stats';
  import {
    calculateGradeDistribution,
    calculateClassGradeAverage,
    calculatePassRate,
    calculateGradeFromPercentage,
    effectiveGradingKey,
    type GradeDistributionBucket,
  } from '$lib/analytics/gradingKey';
  import { exportGradesToCsv } from '$lib/analytics/csvExport';
  import { buildSubmissionMap } from '$lib/utils/studentLookup';
  import { translate } from '$lib/i18n';

  $: examId = $page.params.id || '';

  let exam: ExamRecord | null = null;
  let exercises: ExerciseRecord[] = [];
  let submissions: SubmissionRecord[] = [];
  let students: StudentRecord[] = [];
  let showConfirmModal = false;
  let percentageBins: PercentageHistogramBin[] = [];
  let gradeBuckets: GradeDistributionBucket[] = [];
  let meanPercentage = 0;
  let medianPercentage = 0;
  let stdDevPercentage = 0;
  let classGradeAverage: number | null = null;
  let passRate: number | null = null;
  let meanPoints: number | null = null;
  let totalMaxPoints: number | null = null;
  let fullyGradedCount = 0;
  let submissionsWithAnyGrade = 0;
  let dataLoaded = false;

  /**
   * Per-submission results, kept so the CSV export reports exactly what the
   * charts show rather than recomputing from `totalScore`, which is only written
   * for fully graded submissions and disagreed with the banner.
   */
  let perSubmission: {
    submissionId: string;
    percentage: number;
    points: number;
    maxPoints: number;
    isComplete: boolean;
  }[] = [];

  /**
   * Single-flight guard. The page used to call `loadStats` from a reactive
   * block, `afterNavigate` and `onMount` at once — two or three concurrent loads
   * per visit, racing each other to assign the same variables. Same pattern as
   * routes/analytics/+page.svelte.
   */
  let activeLoadPromise: Promise<void> | null = null;
  let loadedExamId = '';

  $: if (browser && examId && $sessionStore.sessionKey && examId !== loadedExamId) {
    loadedExamId = examId;
    void runLoad(examId);
  }

  onMount(() => {
    if (examId && examId !== loadedExamId) {
      loadedExamId = examId;
      void runLoad(examId);
    }
  });

  function runLoad(id: string): Promise<void> {
    if (activeLoadPromise) return activeLoadPromise;
    activeLoadPromise = loadStats(id).finally(() => {
      activeLoadPromise = null;
    });
    return activeLoadPromise;
  }

  async function loadStats(id: string) {
    if (!id) return;
    await awaitSessionReady();
    const key = get(sessionStore).sessionKey;
    if (!key) return;

    exam = (await loadExamEncrypted(id, key)) || null;
    exercises = await loadExamExercisesEncrypted(id, key);
    submissions = await submissionRepository.getByExamId(id, key);
    students = await studentRepository.getByExamId(id, key);

    const exerciseMaxPoints = exercises.map((ex) => ex.maxPoints || 0);
    totalMaxPoints = exerciseMaxPoints.reduce((sum, p) => sum + p, 0) || null;

    // One scoped read. This was `db.exerciseScores.toArray()` — every score row
    // in the database, for every exam, decrypted on each render.
    const allScores = await scoreRepository.getByExamId(id, key);
    const scoresBySubmission = new Map<string, Map<string, number>>();
    for (const sc of allScores) {
      if (typeof sc.score !== 'number' || isNaN(sc.score)) continue;
      const bucket = scoresBySubmission.get(sc.submissionId) ?? new Map<string, number>();
      bucket.set(sc.exerciseId, sc.score);
      scoresBySubmission.set(sc.submissionId, bucket);
    }

    const results: typeof perSubmission = [];
    for (const sub of submissions) {
      const scoreMap = scoresBySubmission.get(sub.id) ?? new Map<string, number>();
      const orderedScores = exercises.map((ex) => scoreMap.get(ex.id) ?? null);
      const entry = calculateSubmissionPercentage(exerciseMaxPoints, orderedScores);
      if (!entry) continue;
      results.push({
        submissionId: sub.id,
        percentage: entry.percentage,
        points: entry.gradedPoints,
        maxPoints: entry.gradedMaxPoints,
        isComplete: entry.isComplete,
      });
    }

    perSubmission = results;
    const percentages = results.map((r) => r.percentage);
    // Provisional entries are counted, and drawn apart: a class half-corrected
    // is still the class, but it must not read as settled.
    const provisional = results.map((r) => !r.isComplete);

    submissionsWithAnyGrade = results.length;
    fullyGradedCount = results.filter((r) => r.isComplete).length;

    percentageBins = calculatePercentageHistogram(percentages, provisional);
    gradeBuckets = calculateGradeDistribution(percentages, exam?.gradingKey, provisional);
    classGradeAverage = calculateClassGradeAverage(percentages, exam?.gradingKey);
    passRate = calculatePassRate(percentages, exam?.gradingKey);

    if (percentages.length > 0) {
      const sorted = [...percentages].sort((a, b) => a - b);
      const sum = percentages.reduce((a, b) => a + b, 0);
      meanPercentage = Math.round((sum / percentages.length) * 10) / 10;
      const variance =
        percentages.reduce((acc, x) => acc + Math.pow(x - sum / percentages.length, 2), 0) /
        percentages.length;
      stdDevPercentage = Math.round(Math.sqrt(variance) * 10) / 10;
      const mid = Math.floor(percentages.length / 2);
      medianPercentage =
        percentages.length % 2 !== 0
          ? Math.round(sorted[mid] * 10) / 10
          : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
      meanPoints =
        Math.round((results.reduce((a, r) => a + r.points, 0) / results.length) * 10) / 10;
    } else {
      meanPercentage = 0;
      medianPercentage = 0;
      stdDevPercentage = 0;
      meanPoints = null;
    }

    dataLoaded = true;
  }

  async function confirmAndExport() {
    showConfirmModal = false;
    const key = get(sessionStore).sessionKey;

    // buildSubmissionMap, not `s.pseudonymHash === st.pseudonymId`: that compared
    // a raw pseudonym against an HMAC, so every scanned submission exported as
    // "Ungraded" and only manually created rosters ever matched.
    const submissionByStudent = await buildSubmissionMap(submissions, students);
    const resultBySubmission = new Map(perSubmission.map((r) => [r.submissionId, r]));
    const gradingKey = effectiveGradingKey(exam?.gradingKey);
    const ungraded = translate('stats.exportModal.ungraded');

    const rows = students.map((st) => {
      const sub = submissionByStudent.get(st.pseudonymId);
      const result = sub ? resultBySubmission.get(sub.id) : undefined;
      const grade = result ? calculateGradeFromPercentage(result.percentage, gradingKey) : null;

      return {
        studentPseudonymId: st.pseudonymId,
        fallbackCode: st.fallbackCode || '',
        studentName: st.studentName || '',
        totalScore: result ? Math.round(result.points * 100) / 100 : ungraded,
        maxPoints: totalMaxPoints ?? '',
        percentage: result ? Math.round(result.percentage * 10) / 10 : ungraded,
        grade: grade ? grade.grade : ungraded,
        status: result && !result.isComplete ? translate('stats.exportModal.provisional') : '',
      };
    });

    await exportGradesToCsv(examId, exam?.title || 'Exam', rows, key);
  }
</script>

<StatsPage
  {submissionsWithAnyGrade}
  submissionsLength={submissions.length}
  {fullyGradedCount}
  {meanPercentage}
  {stdDevPercentage}
  {medianPercentage}
  {classGradeAverage}
  {passRate}
  {meanPoints}
  {totalMaxPoints}
  {dataLoaded}
  {exam}
  bins={percentageBins}
  {gradeBuckets}
  {showConfirmModal}
  onOpenExport={() => (showConfirmModal = true)}
  onConfirmExport={confirmAndExport}
  onCancelExport={() => (showConfirmModal = false)}
/>
