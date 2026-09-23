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
    summarizeExam,
    type ExamResult,
    type ExamStats,
  } from '$lib/analytics/stats';
  import { calculateGradeFromPercentage } from '$lib/analytics/gradingKey';
  import { exportGradesToCsv } from '$lib/analytics/csvExport';
  import { buildSubmissionMap } from '$lib/utils/studentLookup';
  import { translate } from '$lib/i18n';

  $: examId = $page.params.id || '';

  let exam: ExamRecord | null = null;
  let exercises: ExerciseRecord[] = [];
  let submissions: SubmissionRecord[] = [];
  let students: StudentRecord[] = [];
  let showConfirmModal = false;
  let totalMaxPoints: number | null = null;
  let stats: ExamStats | null = null;

  // Once per exam id: the reactive block and onMount can both fire on one visit.
  let loadedExamId = '';

  $: if (browser && examId && $sessionStore.sessionKey) startLoad();
  onMount(startLoad);

  function startLoad() {
    if (!examId || examId === loadedExamId) return;
    loadedExamId = examId;
    void loadStats(examId);
  }

  async function loadStats(id: string) {
    await awaitSessionReady();
    const key = get(sessionStore).sessionKey;
    if (!key) return;

    exam = (await loadExamEncrypted(id, key)) || null;
    exercises = await loadExamExercisesEncrypted(id, key);
    submissions = await submissionRepository.getByExamId(id, key);
    students = await studentRepository.getByExamId(id, key);

    const exerciseMaxPoints = exercises.map((ex) => ex.maxPoints || 0);
    totalMaxPoints = exerciseMaxPoints.reduce((sum, p) => sum + p, 0) || null;

    const scores = new Map<string, number>();
    for (const sc of await scoreRepository.getByExamId(id, key)) {
      if (typeof sc.score === 'number' && !isNaN(sc.score)) {
        scores.set(`${sc.submissionId}:${sc.exerciseId}`, sc.score);
      }
    }

    const results: ExamResult[] = [];
    for (const sub of submissions) {
      const ordered = exercises.map((ex) => scores.get(`${sub.id}:${ex.id}`) ?? null);
      const entry = calculateSubmissionPercentage(exerciseMaxPoints, ordered);
      if (entry) results.push({ ...entry, submissionId: sub.id });
    }
    stats = summarizeExam(results, exam?.gradingKey);
  }

  async function confirmAndExport() {
    showConfirmModal = false;
    const key = get(sessionStore).sessionKey;

    const submissionByStudent = await buildSubmissionMap(submissions, students);
    const resultBySubmission = new Map((stats?.results ?? []).map((r) => [r.submissionId, r]));
    const ungraded = translate('stats.exportModal.ungraded');

    const rows = students.map((st) => {
      const sub = submissionByStudent.get(st.pseudonymId);
      const result = sub ? resultBySubmission.get(sub.id) : undefined;
      const grade = result ? calculateGradeFromPercentage(result.percentage, exam?.gradingKey) : null;

      return {
        studentPseudonymId: st.pseudonymId,
        fallbackCode: st.fallbackCode || '',
        studentName: st.studentName || '',
        totalScore: result ? Math.round(result.gradedPoints * 100) / 100 : ungraded,
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
  {exam}
  {stats}
  {totalMaxPoints}
  submissionCount={submissions.length}
  {showConfirmModal}
  onOpenExport={() => (showConfirmModal = true)}
  onConfirmExport={confirmAndExport}
  onCancelExport={() => (showConfirmModal = false)}
/>
