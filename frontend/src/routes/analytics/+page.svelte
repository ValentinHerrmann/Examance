<script lang="ts">
  import { t } from '$lib/i18n';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { afterNavigate, goto } from '$app/navigation';
  import { get } from 'svelte/store';
  import { sessionStore, isUnlocked } from '$lib/stores/session';
  import { db } from '$lib/db/db';
  import type { ExamRecord, ExerciseRecord } from '$lib/db/schema';
  import { loadExamsEncrypted, loadExercisesEncrypted, decryptExercise, decryptScore } from '$lib/db/dbEncryption';
  import { submissionRepository } from '$lib/repositories/submissionRepository';
  import type { ExercisePerformance, VariantDetail, VariantGroupComparison } from '$lib/analytics/analyticsTypes';
  import AnalyticsStateBanner from '$lib/components/analytics/AnalyticsStateBanner.svelte';
  import KpiSummaryBar from '$lib/components/analytics/KpiSummaryBar.svelte';
  import VariantFairnessTable from '$lib/components/analytics/VariantFairnessTable.svelte';
  import ExerciseQualityTable from '$lib/components/analytics/ExerciseQualityTable.svelte';
  import { PageShell, PageHeader } from '$lib/components/ui';

  let isInitializing = true;
  let activeLoadPromise: Promise<void> | null = null;
  let pendingReload = false;
  let exams: ExamRecord[] = [];
  let exerciseStats: ExercisePerformance[] = [];
  let variantGroups: VariantGroupComparison[] = [];
  let overallAvgScore: number | null = null;
  let totalSubmissionsCount = 0;
  let gradedSubmissionsCount = 0;
  let showAllExercises = false;

  $: displayedExerciseStats = showAllExercises
    ? exerciseStats
    : exerciseStats.filter((e) => e.avgScorePercent !== null);

  $: displayedVariantGroups = showAllExercises
    ? variantGroups
    : variantGroups.filter((g) => g.variants.some((v) => v.avgScorePercent !== null));

  $: if (browser && $isUnlocked && $sessionStore.sessionKey) {
    triggerAnalyticsLoad();
  }

  afterNavigate(() => {
    if ($isUnlocked && $sessionStore.sessionKey) {
      triggerAnalyticsLoad();
    }
  });

  onMount(async () => {
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
    try {
      const key = get(sessionStore).sessionKey;
      exams = await loadExamsEncrypted(key);

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
    const allExercises = Array.from(exerciseMap.values());

    const allExamExercises = await db.examExercises.toArray();
    const allSubmissions = await submissionRepository.getAll(key);
    const rawScores = await db.exerciseScores.toArray();
    const allScores = await Promise.all(rawScores.map((sc) => decryptScore(sc, key)));

    totalSubmissionsCount = allSubmissions.length;

    // Filter submissions that have been graded
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

    // Only include scores from graded submissions to avoid stale/orphaned scores
    // from ungraded submissions polluting the analytics
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
          name: displayName,
          tag: ex.topicTag,
          grade: ex.grade,
          subject: ex.subject,
          examIds: new Set<string>(),
          scorePairs: [],
        });
      }

      const group = exGroupMap.get(groupKey)!;

      // Add linked active exam IDs
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
        groupName: gData.name,
        topicTag: gData.tag,
        variants: variants.sort((a, b) => a.variantKey.localeCompare(b.variantKey)),
        maxDeltaPercent: delta,
        flaggedFairnessIssue: isFairnessIssue,
      });
    });

    variantGroups = vList;
  } catch (err) {
    console.error('Failed to load analytics:', err);
  }
}
</script>

<PageShell width="full">
  <PageHeader level="h1" title={$t('stats.analyticsPage.heading')} subtitle={$t('stats.analyticsPage.subtitle')} />

  {#if isInitializing}
    <AnalyticsStateBanner variant="loading" />
  {:else if !$isUnlocked}
    <AnalyticsStateBanner variant="locked" />
  {:else}
    <!-- KPI Overview Row -->
    <KpiSummaryBar
      examsCount={exams.length}
      {totalSubmissionsCount}
      {gradedSubmissionsCount}
      {overallAvgScore}
      flaggedCount={exerciseStats.filter((e) => e.flaggedProblematic).length}
    />

    <div class="grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-2">
      <!-- Section 1: Variant Fairness & Difficulty Comparison -->
      <div class="min-w-0">
        <VariantFairnessTable
          {variantGroups}
          {displayedVariantGroups}
          bind:showAll={showAllExercises}
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
  {/if}
</PageShell>
