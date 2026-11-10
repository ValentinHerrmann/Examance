<script lang="ts">
  import { t, translate } from '#lib/i18n';
  import { onMount, untrack } from 'svelte';
  import { browser } from '$app/env';
  import { afterNavigate, goto } from '$app/navigation';
  import { get } from 'svelte/store';
  import { sessionStore, isUnlocked, awaitSessionReady } from '#lib/stores/session';
  import { db } from '#lib/db/db';
  import type { ExamRecord, ExerciseRecord, SubmissionRecord } from '#lib/db/schema';
  import { loadExamsEncrypted, loadExercisesEncrypted, loadExamExercisesEncrypted, decryptExercise, decryptScore } from '#lib/db/dbEncryption';
  import { scoreRepository } from '#lib/repositories/scoreRepository';
  import { submissionRepository } from '#lib/repositories/submissionRepository';
  import type { ExercisePerformance, VariantDetail, VariantGroupComparison } from '#lib/analytics/analyticsTypes';
  import {
    calculateOverallScoreDistribution,
    examMaxPoints,
    type OverallScoreDistribution,
  } from '#lib/analytics/overallScores';
  import AnalyticsStateBanner from '#lib/components/analytics/AnalyticsStateBanner.svelte';
  import KpiSummaryBar from '#lib/components/analytics/KpiSummaryBar.svelte';
  import OverallScoreHistogram from '#lib/components/analytics/OverallScoreHistogram.svelte';
  import VariantFairnessTable from '#lib/components/analytics/VariantFairnessTable.svelte';
  import ExerciseEditorModal from '#lib/components/ExerciseEditorModal.svelte';
  import ExerciseQualityTable from '#lib/components/analytics/ExerciseQualityTable.svelte';
  import { Alert, Button, Card, ConfirmDialog, PageShell, PageHeader, actionIcons } from '#lib/components/ui';
  import { mergeKeptStatistics } from '#lib/analytics/keptStatistics';
  import { statisticsRepository, type StoredStatistics } from '#lib/repositories/statisticsRepository';

  let isInitializing = $state(true);
  // A failed read must not render as "no data": the page shows only this instead of zeroed charts.
  let loadError = $state('');
  let activeLoadPromise: Promise<void> | null = null;
  let pendingReload = false;
  let exams: ExamRecord[] = $state.raw([]);
  let exerciseRecords = new Map<string, ExerciseRecord>();
  let editEx: ExerciseRecord | null = $state.raw(null);
  let exerciseStats: ExercisePerformance[] = $state.raw([]);
  let variantGroups: VariantGroupComparison[] = $state.raw([]);
  let overallAvgScore: number | null = $state(null);
  let totalSubmissionsCount = $state(0);
  let gradedSubmissionsCount = $state(0);
  let scoreDistribution: OverallScoreDistribution | null = $state.raw(null);
  let showAllExercises = $state(false);
  // Kept statistics records (issue #238): exams counted without results here, and records of deleted exams.
  let statsOnlyCount = $state(0);
  let deletedExams: StoredStatistics[] = $state.raw([]);
  let deletingStats: StoredStatistics | null = $state.raw(null);
  let deleteStatsBusy = $state(false);
  let deleteStatsError = $state('');
  let maxPointsByRecord = new Map<string, number>();
  let keptLoadError = $state('');

  let displayedExerciseStats = $derived(showAllExercises
    ? exerciseStats
    : exerciseStats.filter((e) => e.avgScorePercent !== null));

  let displayedVariantGroups = $derived(showAllExercises
    ? variantGroups
    : variantGroups.filter((g) => g.variants.some((v) => v.avgScorePercent !== null)));

  afterNavigate(() => {
    if ($isUnlocked && $sessionStore.sessionKey) {
      triggerAnalyticsLoad();
    }
  });

  onMount(async () => {
    await awaitSessionReady();
    try {
      if (!$isUnlocked) {
        await goto("/unlock");
        return;
      }
      await triggerAnalyticsLoad();
    } finally {
      isInitializing = false;
    }
  });

  async function triggerAnalyticsLoad() {
    if (activeLoadPromise) {
      pendingReload = true;
      await activeLoadPromise;
      if (pendingReload) {
        pendingReload = false;
        return triggerAnalyticsLoad();
      }
      return;
    }

    activeLoadPromise = (async () => {
      try {
        await loadAnalytics();
      } finally {
        activeLoadPromise = null;
      }
    })();

    await activeLoadPromise;
  }

  async function loadAnalytics() {
    loadError = '';
    try {
      const key = get(sessionStore).sessionKey;
      const liveExams = await loadExamsEncrypted(key);

    const repoExercises = await loadExercisesEncrypted(key);
    const rawExercises = await db.exercises.toArray();
    const decryptedRaw = await Promise.all(rawExercises.map((ex) => decryptExercise(ex, key)));

    const exerciseMap = new Map<string, ExerciseRecord>();
    repoExercises.forEach((ex) => exerciseMap.set(ex.id, ex));
    decryptedRaw.forEach((ex) => {
      if (!exerciseMap.has(ex.id) || ex.exerciseGroupId || ex.variantKey) {
        exerciseMap.set(ex.id, { ...exerciseMap.get(ex.id), ...ex });
      }
    });
    const liveSubmissions = await submissionRepository.getAll(key, liveExams);
    // Through the repository, so server mode sees its own rows rather than an empty local cache that lockSession() wiped.
    const liveScores = await scoreRepository.getAll(
      liveExams.map((e) => e.id),
      key,
    );
    let stored: StoredStatistics[] = [];
    keptLoadError = '';
    try {
      stored = await statisticsRepository.list(key);
    } catch (err) {
      // Live results still make a correct page, but it must say that the kept records are missing.
      keptLoadError = translate('stats.analyticsPage.keptLoadFailed', { message: err instanceof Error ? err.message : String(err) });
    }
    const merged = mergeKeptStatistics(
      { exams: liveExams, exercises: Array.from(exerciseMap.values()), examExercises: await db.examExercises.toArray(), submissions: liveSubmissions, scores: liveScores },
      stored,
    );
    exams = merged.exams;
    statsOnlyCount = merged.statsOnlyExamIds.size;
    deletedExams = merged.deletedExams;
    maxPointsByRecord = merged.maxPointsByExam;
    const allExercises = merged.exercises;
    // Only real exercises open in the editor; record-only stand-ins carry no content to edit.
    exerciseRecords = exerciseMap;
    const allExamExercises = merged.examExercises;
    const allSubmissions = merged.submissions;
    const allScores = merged.scores;

    totalSubmissionsCount = allSubmissions.length;

    const gradedSubmissions = allSubmissions.filter(
      (s) => typeof s.totalScore === 'number' && !isNaN(s.totalScore)
    );
    gradedSubmissionsCount = gradedSubmissions.length;

    if (gradedSubmissionsCount > 0) {
      const sum = gradedSubmissions.reduce((acc, s) => acc + (s.totalScore || 0), 0);
      overallAvgScore = Math.round(sum / gradedSubmissionsCount);
    } else {
      overallAvgScore = null;
    }

    const validExamIds = new Set(exams.map((e) => e.id));

    // Map exercise IDs to parent exam IDs using examExercises junction table
    const examMapByExercise = new Map<string, Set<string>>();
    for (const ee of allExamExercises) {
      if (validExamIds.has(ee.examId)) {
        if (!examMapByExercise.has(ee.exerciseId)) {
          examMapByExercise.set(ee.exerciseId, new Set());
        }
        examMapByExercise.get(ee.exerciseId)!.add(ee.examId);
      }
    }

    // Only include scores from graded submissions to avoid stale/orphaned scores from ungraded submissions polluting the analytics
    const gradedSubmissionIds = new Set(gradedSubmissions.map((s) => s.id));

    // Group scores by exercise ID (only from graded submissions)
    const scoresByExercise = new Map<string, number[]>();
    for (const sc of allScores) {
      if (typeof sc.score === 'number' && !isNaN(sc.score) && gradedSubmissionIds.has(sc.submissionId)) {
        if (!scoresByExercise.has(sc.exerciseId)) {
          scoresByExercise.set(sc.exerciseId, []);
        }
        scoresByExercise.get(sc.exerciseId)!.push(sc.score);
      }
    }

    // 1. Aggregate stats by exercise group key (group ID, name, or distinct ID)
    // Store {score, maxPoints} pairs so variants with different maxPoints are handled correctly
    const exGroupMap = new Map<string, {
      groupId?: string;
      name: string;
      tag?: string;
      grade?: string;
      subject?: string;
      examIds: Set<string>;
      scorePairs: { score: number; maxPoints: number }[];
    }>();

    for (const ex of allExercises) {
      const groupKey = ex.exerciseGroupId || (ex.name && ex.name.trim() ? ex.name.trim() : null) || ex.id;
      const displayName = ex.name || ex.title || (ex.topicTag ? `${ex.topicTag} Question` : `Question ${ex.id.substring(0, 6)}`);

      if (!exGroupMap.has(groupKey)) {
        exGroupMap.set(groupKey, {
          ...(ex.exerciseGroupId ? { groupId: ex.exerciseGroupId } : {}),
          name: displayName,
          tag: ex.topicTag,
          grade: ex.grade,
          subject: ex.subject,
          examIds: new Set<string>(),
          scorePairs: [],
        });
      }

      const group = exGroupMap.get(groupKey)!;

      const linkedExams = examMapByExercise.get(ex.id);
      if (linkedExams) {
        linkedExams.forEach((eId) => {
          if (validExamIds.has(eId)) group.examIds.add(eId);
        });
      }
      if (ex.examId && validExamIds.has(ex.examId)) {
        group.examIds.add(ex.examId);
      }

      // Add scores paired with their own maxPoints (variants can have different maxPoints)
      const exScores = scoresByExercise.get(ex.id);
      if (exScores) {
        const exMax = ex.maxPoints || 10;
        for (const sc of exScores) {
          group.scorePairs.push({ score: sc, maxPoints: exMax });
        }
      }
    }

    // Build final performance list (only exercises linked to at least 1 active exam)
    const list: ExercisePerformance[] = [];

    exGroupMap.forEach((group, key) => {
      if (group.examIds.size === 0) return; // Skip unlinked library items

      let avgScorePct: number | null = null;
      let isProblematic = false;

      if (group.scorePairs.length > 0) {
        // Calculate percentage per score using its own maxPoints, then average percentages
        const pcts = group.scorePairs.map((p) => (p.score / Math.max(p.maxPoints, 1)) * 100);
        const avgPct = pcts.reduce((a, b) => a + b, 0) / pcts.length;
        avgScorePct = Math.min(100, Math.max(0, Math.round(avgPct)));
        isProblematic = avgScorePct < 60;
      }

      list.push({
        id: key,
        ...(group.groupId ? { groupId: group.groupId } : {}),
        name: group.name,
        topicTag: group.tag,
        grade: group.grade,
        subject: group.subject,
        totalAppeared: group.examIds.size,
        avgScorePercent: avgScorePct,
        flaggedProblematic: isProblematic,
      });
    });

    // Sort: Problematic first, then by score percentage, then by name
    exerciseStats = list.sort((a, b) => {
      if (a.avgScorePercent === null && b.avgScorePercent === null) return a.name.localeCompare(b.name);
      if (a.avgScorePercent === null) return 1;
      if (b.avgScorePercent === null) return -1;
      return a.avgScorePercent - b.avgScorePercent;
    });

    // 2. Build Variant Group Comparisons (for questions with multiple variants)
    const vGroupMap = new Map<string, {
      realGroup: boolean;
      name: string;
      tag?: string;
      variants: Map<string, {
        exerciseId: string;
        variantKey: string;
        name: string;
        maxPoints: number;
        examIds: Set<string>;
        scores: number[];
      }>;
    }>();

    for (const ex of allExercises) {
      const gId = ex.exerciseGroupId || (ex.variantKey ? (ex.name || ex.title || ex.id) : null);
      if (!gId) continue;

      const vKey = ex.variantKey || 'Default Variant';
      const displayName = ex.name || ex.title || 'Untitled Exercise';

      if (!vGroupMap.has(gId)) {
        vGroupMap.set(gId, {
          realGroup: !!ex.exerciseGroupId,
          name: displayName,
          tag: ex.topicTag,
          variants: new Map(),
        });
      }

      const vGroup = vGroupMap.get(gId)!;

      if (!vGroup.variants.has(vKey)) {
        vGroup.variants.set(vKey, {
          exerciseId: ex.id,
          variantKey: vKey,
          name: displayName,
          maxPoints: ex.maxPoints || 10,
          examIds: new Set<string>(),
          scores: [],
        });
      }

      const vItem = vGroup.variants.get(vKey)!;

      const linkedExams = examMapByExercise.get(ex.id);
      if (linkedExams) {
        linkedExams.forEach((eId) => {
          if (validExamIds.has(eId)) vItem.examIds.add(eId);
        });
      }
      if (ex.examId && validExamIds.has(ex.examId)) {
        vItem.examIds.add(ex.examId);
      }

      const exScores = scoresByExercise.get(ex.id);
      if (exScores) {
        vItem.scores.push(...exScores);
      }
    }

    const vList: VariantGroupComparison[] = [];

    vGroupMap.forEach((gData, gId) => {
      // Calculate total active exam appearances for the entire variant group
      let totalGroupExams = 0;
      gData.variants.forEach((vData) => {
        totalGroupExams += vData.examIds.size;
      });
      if (totalGroupExams === 0) return; // Skip unlinked library items

      const variants: VariantDetail[] = [];
      const validPercents: number[] = [];

      gData.variants.forEach((vData) => {
        let avgPct: number | null = null;
        if (vData.scores.length > 0 && vData.maxPoints > 0) {
          const sum = vData.scores.reduce((a, b) => a + b, 0);
          avgPct = Math.min(100, Math.max(0, Math.round(((sum / vData.scores.length) / vData.maxPoints) * 100)));
          validPercents.push(avgPct);
        }

        variants.push({
          exerciseId: vData.exerciseId,
          variantKey: vData.variantKey,
          name: vData.name,
          maxPoints: vData.maxPoints,
          totalAppeared: vData.examIds.size,
          avgScorePercent: avgPct,
        });
      });

      let delta: number | null = null;
      let isFairnessIssue = false;
      if (validPercents.length >= 2) {
        delta = Math.max(...validPercents) - Math.min(...validPercents);
        isFairnessIssue = delta >= 15; // 15% discrepancy between variants
      }

      vList.push({
        groupId: gId,
        groupIdIsReal: gData.realGroup,
        groupName: gData.name,
        topicTag: gData.tag,
        variants: variants.sort((a, b) => a.variantKey.localeCompare(b.variantKey)),
        maxDeltaPercent: delta,
        flaggedFairnessIssue: isFairnessIssue,
      });
    });

    variantGroups = vList;

    scoreDistribution = await loadScoreDistribution(allSubmissions, key);
  } catch (err) {
    console.error('Failed to load analytics:', err);
    loadError = translate('stats.analyticsPage.loadFailed', { message: err instanceof Error ? err.message : String(err) });
  }
}

  // Maxima come from the per-exam exercise list the exam statistics use, so both views share one 100 %.
  async function loadScoreDistribution(submissions: SubmissionRecord[], key: CryptoKey | null) {
    const known = new Set(exams.map((e) => e.id));
    const gradedExamIds = new Set(
      submissions.filter((s) => typeof s.totalScore === 'number' && known.has(s.examId)).map((s) => s.examId),
    );
    const maxPointsByExam = new Map<string, number>();
    await Promise.all(
      [...gradedExamIds].map(async (examId) => {
        const kept = maxPointsByRecord.get(examId);
        maxPointsByExam.set(examId, kept ?? examMaxPoints(await loadExamExercisesEncrypted(examId, key)));
      }),
    );
    return calculateOverallScoreDistribution(submissions, maxPointsByExam);
  }

  async function deleteKeptStatistics() {
    if (!deletingStats) return;
    deleteStatsBusy = true;
    deleteStatsError = '';
    try {
      await statisticsRepository.delete(deletingStats.id);
      deletingStats = null;
      await triggerAnalyticsLoad();
    } catch (err) {
      deleteStatsError = translate('stats.page.deleteStatisticsFailed', { message: err instanceof Error ? err.message : String(err) });
    } finally {
      deleteStatsBusy = false;
    }
  }

  $effect.pre(() => {
    if (browser && $isUnlocked && $sessionStore.sessionKey) {
      untrack(() => triggerAnalyticsLoad());
    }
  });
</script>

<PageShell width="full">
  <PageHeader
    level="h1"
    title={$t('stats.analyticsPage.heading')}
    subtitle={$t('stats.analyticsPage.subtitle')}
    helpTopic="analytics"
  />

  {#if isInitializing}
    <AnalyticsStateBanner variant="loading" />
  {:else if !$isUnlocked}
    <AnalyticsStateBanner variant="locked" />
  {:else if loadError}
    <Alert severity="danger">{loadError}</Alert>
  {:else}
    <!-- KPI Overview Row -->
    <KpiSummaryBar
      examsCount={exams.length}
      {totalSubmissionsCount}
      {gradedSubmissionsCount}
      {overallAvgScore}
      flaggedCount={exerciseStats.filter((e) => e.flaggedProblematic).length}
    />

    {#if keptLoadError}
      <Alert severity="warning" class="mb-6">{keptLoadError}</Alert>
    {/if}
    {#if statsOnlyCount > 0}
      <Alert severity="info" class="mb-6" title={$t('stats.analyticsPage.statsOnlyTitle')}>
        {$t('stats.analyticsPage.statsOnlyBody', { count: statsOnlyCount })}
      </Alert>
    {/if}

    <OverallScoreHistogram class="mb-6" distribution={scoreDistribution} />

    <div class="grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-2">
      <!-- Section 1: Variant Fairness & Difficulty Comparison -->
      <div class="min-w-0">
        <VariantFairnessTable
          {variantGroups}
          {displayedVariantGroups}
          bind:showAll={showAllExercises}
          onOpenExercise={(id) => (editEx = exerciseRecords.get(id) ?? null)}
        />
      </div>

      <!-- Section 2: Cross-Exam Exercise Quality Metrics -->
      <div class="min-w-0">
        <ExerciseQualityTable
          {exerciseStats}
          {displayedExerciseStats}
          examsCount={exams.length}
          bind:showAll={showAllExercises}
        />
      </div>
    </div>

    {#if deletedExams.length > 0}
      <Card class="mt-6">
        <h2 class="mb-3 text-base font-semibold">{$t('stats.analyticsPage.deletedExamsTitle')}</h2>
        <ul class="divide-y divide-line">
          {#each deletedExams as record (record.id)}
            <li class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 py-2">
              <span class="min-w-0 flex-1 truncate">{record.snapshot.exam.title || record.snapshot.exam.testart || record.examId}</span>
              {#if record.snapshot.exam.datum}<span class="text-sm text-muted">{record.snapshot.exam.datum}</span>{/if}
              <span class="rounded-md bg-surface-sunken px-2 py-0.5 text-xs text-muted">{$t('stats.analyticsPage.deletedExamBadge')}</span>
              <Button size="sm" variant="outlined" severity="danger" icon={actionIcons.delete} onClick={() => { deleteStatsError = ''; deletingStats = record; }}>
                {$t('stats.analyticsPage.deleteStatistics')}
              </Button>
            </li>
          {/each}
        </ul>
      </Card>
    {/if}
  {/if}
</PageShell>

<ConfirmDialog
  open={deletingStats !== null}
  title={$t('stats.page.deleteStatisticsTitle')}
  message={$t('stats.page.deleteStatisticsBody')}
  confirmText={$t('stats.page.deleteStatistics')}
  cancelText={$t('common.cancel')}
  severity="danger"
  busy={deleteStatsBusy}
  error={deleteStatsError}
  onConfirm={deleteKeptStatistics}
  onCancel={() => (deletingStats = null)}
/>

{#if editEx}
  <ExerciseEditorModal isOpen editingExercise={editEx} onClose={() => (editEx = null)} onSave={() => loadAnalytics()} />
{/if}
