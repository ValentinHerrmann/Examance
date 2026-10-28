<script lang="ts">
  import { page } from '$app/state';
  import { onMount, untrack } from 'svelte';
  import { browser } from '$app/env';
  import { get } from 'svelte/store';
  import StatsPage from '#lib/components/stats/StatsPage.svelte';
  import type { ExamRecord, ExerciseRecord, SubmissionRecord, StudentRecord } from '#lib/db/schema';
  import { loadExamEncrypted, loadExamExercisesEncrypted } from '#lib/db/dbEncryption';
  import { scoreRepository } from '#lib/repositories/scoreRepository';
  import { submissionRepository } from '#lib/repositories/submissionRepository';
  import { studentRepository } from '#lib/repositories/studentRepository';
  import { sessionStore, awaitSessionReady } from '#lib/stores/session';
  import { translate } from '#lib/i18n';
  import type { ExamStats } from '#lib/analytics/stats';
  import { buildGradeRows, computeExamResults } from '#lib/analytics/examResults';
  import { exportGradesToCsv } from '#lib/analytics/csvExport';

  let examId = $derived(page.params.id || '');

  // Raw: records go to lib/analytics and the CSV export unchanged.
  let exam: ExamRecord | null = $state.raw(null);
  let exercises: ExerciseRecord[] = [];
  let submissions: SubmissionRecord[] = $state.raw([]);
  let students: StudentRecord[] = [];
  let showConfirmModal = $state(false);
  let totalMaxPoints: number | null = $state(null);
  let stats: ExamStats | null = $state.raw(null);
  // Set when a read failed: the page shows it instead of the "nothing graded yet" text.
  let loadError = $state('');

  // Once per exam id: the reactive block and onMount can both fire on one visit.
  let loadedExamId = '';

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

    loadError = '';
    try {
      exam = (await loadExamEncrypted(id, key)) || null;
      exercises = await loadExamExercisesEncrypted(id, key);
      submissions = await submissionRepository.getByExamId(id, key);
      students = await studentRepository.getByExamId(id, key);

      const computed = computeExamResults(exam, exercises, submissions, await scoreRepository.getByExamId(id, key));
      totalMaxPoints = computed.totalMaxPoints;
      stats = computed.stats;
    } catch (err) {
      console.error('Failed to load exam statistics:', err);
      stats = null;
      submissions = [];
      loadError = translate('stats.page.loadFailed', { message: err instanceof Error ? err.message : String(err) });
    }
  }

  async function confirmAndExport() {
    showConfirmModal = false;
    const key = get(sessionStore).sessionKey;
    if (!stats) return;
    const rows = await buildGradeRows(exam, students, submissions, { stats, totalMaxPoints });
    await exportGradesToCsv(examId, exam?.title || 'Exam', rows, key);
  }

  $effect.pre(() => {
    if (browser && examId && $sessionStore.sessionKey) untrack(startLoad);
  });
</script>

<StatsPage
  {exam}
  {stats}
  {loadError}
  {totalMaxPoints}
  submissionCount={submissions.length}
  submissionIds={submissions.map((s) => s.id)}
  {showConfirmModal}
  onOpenExport={() => (showConfirmModal = true)}
  onConfirmExport={confirmAndExport}
  onCancelExport={() => (showConfirmModal = false)}
/>
