<script lang="ts">
  import { page } from '$app/state';
  import { onMount, untrack } from 'svelte';
  import { browser } from '$app/env';
  import { get } from 'svelte/store';
  import StatsPage from '#lib/components/stats/StatsPage.svelte';
  import type { ExamRecord, ExerciseRecord, ExerciseScoreRecord, GradingKeyConfig, SubmissionRecord, StudentRecord } from '#lib/db/schema';
  import GradingKeyPanel from '#lib/components/stats/GradingKeyPanel.svelte';
  import { loadExamEncrypted, loadExamExercisesEncrypted } from '#lib/db/dbEncryption';
  import { scoreRepository } from '#lib/repositories/scoreRepository';
  import { submissionRepository } from '#lib/repositories/submissionRepository';
  import { studentRepository } from '#lib/repositories/studentRepository';
  import { sessionStore, awaitSessionReady } from '#lib/stores/session';
  import { t, translate } from '#lib/i18n';
  import type { ExamStats } from '#lib/analytics/stats';
  import { buildGradeRows, computeExamResults } from '#lib/analytics/examResults';
  import { exportGradesToCsv } from '#lib/analytics/csvExport';
  import { snapshotRecords } from '#lib/analytics/statisticsSnapshot';
  import { statisticsRepository, type StoredStatistics } from '#lib/repositories/statisticsRepository';
  import { refreshStatistics } from '#lib/analytics/statisticsSync';
  import { ConfirmDialog } from '#lib/components/ui';

  let examId = $derived(page.params.id || '');

  // Raw: records go to lib/analytics and the CSV export unchanged.
  let exam: ExamRecord | null = $state.raw(null);
  let exercises: ExerciseRecord[] = [];
  let submissions: SubmissionRecord[] = $state.raw([]);
  let students: StudentRecord[] = [];
  let scores: ExerciseScoreRecord[] = [];
  let showConfirmModal = $state(false);
  let totalMaxPoints: number | null = $state(null);
  let stats: ExamStats | null = $state.raw(null);
  // Set when a read failed: the page shows it instead of the "nothing graded yet" text.
  let loadError = $state('');
  // The kept record shown when no results are left here (issue #238).
  let storedStats: StoredStatistics | null = $state.raw(null);
  let confirmDeleteStats = $state(false);
  let deleteStatsBusy = $state(false);
  let deleteStatsError = $state('');

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

      scores = await scoreRepository.getByExamId(id, key);
      storedStats = null;
      recompute(exam?.gradingKey);
      if (stats?.results.length) {
        // Catches up a rebuild a closed tab never ran, so the kept record matches what is shown here.
        refreshStatistics(id).catch((err) => console.warn('Statistics not updated:', err));
      } else await useStoredStatistics(id, key);
    } catch (err) {
      console.error('Failed to load exam statistics:', err);
      stats = null;
      submissions = [];
      loadError = translate('stats.page.loadFailed', { message: err instanceof Error ? err.message : String(err) });
    }
  }

  /** No results here (purged, or kept in another browser): the anonymous record stands in, without students. */
  async function useStoredStatistics(id: string, key: CryptoKey) {
    // A failed read reaches loadError: "nothing graded" would be untrue when a record exists.
    const stored = await statisticsRepository.findByExam(id, key);
    if (!stored) return;
    const records = snapshotRecords(stored.snapshot);
    storedStats = stored;
    if (!exercises.length) exercises = records.exercises;
    submissions = records.submissions;
    scores = records.scores;
    students = [];
    recompute(exam?.gradingKey);
  }

  async function deleteStoredStatistics() {
    if (!storedStats) return;
    deleteStatsBusy = true;
    deleteStatsError = '';
    try {
      await statisticsRepository.delete(storedStats.id);
      confirmDeleteStats = false;
      loadedExamId = '';
      startLoad();
    } catch (err) {
      deleteStatsError = translate('stats.page.deleteStatisticsFailed', { message: err instanceof Error ? err.message : String(err) });
    } finally {
      deleteStatsBusy = false;
    }
  }

  /** Statistics under a grading key: the stored one, or the one being edited (issue #212). */
  function recompute(gradingKey: GradingKeyConfig | undefined) {
    const computed = computeExamResults(exam && gradingKey ? { ...exam, gradingKey } : exam, exercises, submissions, scores);
    totalMaxPoints = computed.totalMaxPoints;
    stats = computed.stats;
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
  statsOnly={storedStats !== null}
  onDeleteStatistics={() => (confirmDeleteStats = true)}
>
  {#snippet gradingKeyPanel()}
    {#if exam}
      <GradingKeyPanel {exam} onPreview={(key) => recompute(key)} onSaved={(updated) => (exam = updated)} />
    {/if}
  {/snippet}
</StatsPage>

<ConfirmDialog
  open={confirmDeleteStats}
  title={$t('stats.page.deleteStatisticsTitle')}
  message={$t('stats.page.deleteStatisticsBody')}
  confirmText={$t('stats.page.deleteStatistics')}
  cancelText={$t('common.cancel')}
  severity="danger"
  busy={deleteStatsBusy}
  error={deleteStatsError}
  onConfirm={deleteStoredStatistics}
  onCancel={() => (confirmDeleteStats = false)}
/>
