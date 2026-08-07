<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { afterNavigate } from '$app/navigation';
  import { get } from 'svelte/store';
  import StatsPage from '$lib/components/stats/StatsPage.svelte';
  import type { ExamRecord, ExerciseRecord, SubmissionRecord, StudentRecord, ExerciseScoreRecord } from '$lib/db/schema';
  import { loadExamEncrypted, loadExamExercisesEncrypted, decryptScore } from '$lib/db/dbEncryption';
  import { submissionRepository } from '$lib/repositories/submissionRepository';
  import { studentRepository } from '$lib/repositories/studentRepository';
  import { sessionStore } from '$lib/stores/session';
  import { calculateSubmissionPercentage, calculatePercentageHistogram, type PercentageHistogramBin } from '$lib/analytics/stats';
  import { calculateGradeDistribution, getPresetCutoffs, type GradeDistributionBucket } from '$lib/analytics/gradingKey';
  import { exportGradesToCsv } from '$lib/analytics/csvExport';
  import { db } from '$lib/db/db';

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
  let allPercentages: number[] = [];
  let dataLoaded = false;

  $: if (browser && examId && $sessionStore.sessionKey) {
    loadStats(examId);
  }

  afterNavigate(() => {
    if (examId && $sessionStore.sessionKey) {
      loadStats(examId);
    }
  });

  onMount(async () => {
    if (examId && $sessionStore.sessionKey) {
      await loadStats(examId);
    }
  });

  async function loadStats(id: string) {
    if (!id) return;
    const key = get(sessionStore).sessionKey;
    exam = (await loadExamEncrypted(id, key)) || null;
    exercises = await loadExamExercisesEncrypted(id, key);
    submissions = await submissionRepository.getByExamId(id, key);
    students = await studentRepository.getByExamId(id, key);

    const exerciseMaxPoints = exercises.map((ex) => ex.maxPoints || 0);
    const rawAllScores = await db.exerciseScores.toArray();
    const decryptedScores = await Promise.all(rawAllScores.map((sc) => decryptScore(sc, key)));
    const scoresBySubmission = new Map<string, ExerciseScoreRecord[]>();
    for (const sc of decryptedScores) {
      if (!scoresBySubmission.has(sc.submissionId)) {
        scoresBySubmission.set(sc.submissionId, []);
      }
      scoresBySubmission.get(sc.submissionId)!.push(sc);
    }

    const percentages: number[] = [];
    for (const sub of submissions) {
      const rawScores = scoresBySubmission.get(sub.id) || [];
      const scoreMap = new Map<string, number>();
      for (const rs of rawScores) {
        if (typeof rs.score === 'number' && !isNaN(rs.score)) {
          scoreMap.set(rs.exerciseId, rs.score);
        }
      }
      const orderedScores = exercises.map((ex) => scoreMap.get(ex.id) ?? null);
      const entry = calculateSubmissionPercentage(exerciseMaxPoints, orderedScores);
      if (entry) {
        percentages.push(entry.percentage);
      }
    }

    allPercentages = percentages;
    percentageBins = calculatePercentageHistogram(percentages);
    dataLoaded = true;
    gradeBuckets = calculateGradeDistribution(percentages, exam?.gradingKey);

    if (percentages.length > 0) {
      const sorted = [...percentages].sort((a, b) => a - b);
      const sum = percentages.reduce((a, b) => a + b, 0);
      meanPercentage = Math.round((sum / percentages.length) * 10) / 10;
      const variance = percentages.reduce((acc, x) => acc + Math.pow(x - meanPercentage, 2), 0) / percentages.length;
      stdDevPercentage = Math.round(Math.sqrt(variance) * 10) / 10;
      const mid = Math.floor(percentages.length / 2);
      medianPercentage = percentages.length % 2 !== 0
        ? Math.round(sorted[mid] * 10) / 10
        : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
    } else {
      meanPercentage = 0;
      medianPercentage = 0;
      stdDevPercentage = 0;
    }
  }

  $: fullyGradedCount = submissions.filter(
    (s) => typeof s.totalScore === 'number' && !isNaN(s.totalScore)
  ).length;

  $: submissionsWithAnyGrade = percentageBins.reduce((sum, b) => sum + b.count, 0);

  $: {
    const effectiveKey = exam?.gradingKey || { preset: 'linear_50' as const, cutoffs: getPresetCutoffs('linear_50') };
    gradeBuckets = calculateGradeDistribution(allPercentages, effectiveKey);
  }

  async function confirmAndExport() {
    showConfirmModal = false;
    const key = get(sessionStore).sessionKey;
    const rows = students.map((st) => {
      const sub = submissions.find((s) => s.pseudonymHash === st.pseudonymId);
      return {
        studentPseudonymId: st.pseudonymId,
        fallbackCode: st.fallbackCode || '',
        totalScore: typeof sub?.totalScore === 'number' ? sub.totalScore : 'Ungraded',
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
  {dataLoaded}
  {exam}
  bins={percentageBins}
  {gradeBuckets}
  {showConfirmModal}
  onOpenExport={() => (showConfirmModal = true)}
  onConfirmExport={confirmAndExport}
  onCancelExport={() => (showConfirmModal = false)}
/>