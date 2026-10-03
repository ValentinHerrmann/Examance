<script lang="ts">
  import { isUnlocked, isAuthenticated, sessionStore, awaitSessionReady } from '$lib/stores/session';
  import { db } from '$lib/db/db';
  import type { ExamRecord } from '$lib/db/schema';
  import { loadExamsEncrypted, saveExamEncrypted, encryptExam, encryptExercise } from '$lib/db/dbEncryption';
  import { importArchiveInteractively } from '$lib/services/archiveService';
  import { checkRetention, type RetentionCheckResult } from '$lib/gdpr/retention';
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';

  import { storagePolicyStore } from '$lib/stores/storagePolicy';
  import { api } from '$lib/api/client';
  import { examRepository, mapApiToExamRecord } from '$lib/repositories/examRepository';
  import { submissionRepository } from '$lib/repositories/submissionRepository';
  import { offlineQueue } from '$lib/services/offlineQueue';
  import { goto } from '$app/navigation';
  import { t, translate } from '$lib/i18n';
  import { faUpload } from '@fortawesome/free-solid-svg-icons';

  import DashboardSessionState from '$lib/components/dashboard/DashboardSessionState.svelte';
  import KpiSidebar from '$lib/components/dashboard/KpiSidebar.svelte';
  import RetentionModal from '$lib/components/dashboard/RetentionModal.svelte';
  import OnboardingEmptyState from '$lib/components/dashboard/OnboardingEmptyState.svelte';
  import ExamFilterSidebar from '$lib/components/dashboard/ExamFilterSidebar.svelte';
  import ExamList from '$lib/components/dashboard/ExamList.svelte';
  import { Alert, Button, ConfirmDeleteModal, FilterDrawer, PageHeader, PageShell } from '$lib/components/ui';


  let exams: ExamRecord[] = [];
  /** Set when the server refused the exam list, so the view can say so. */
  let examsLoadFailed = false;
  let examStatsMap = new Map<string, { avgScore: number | null; count: number }>();
  let isImporting = false;
  let importStatus = '';
  let isInitializing = true;
  let expiredExam: { exam: ExamRecord; check: RetentionCheckResult } | null = null;

  let searchQuery = '';
  let selectedGradeFilter = 'ALL';
  let selectedSubjectFilter = 'ALL';
  let selectedTestartFilter = 'ALL';
  let isFilterDrawerOpen = false;

  // Badge on the mobile filter button, so an active filter is visible without
  // opening the drawer.
  $: activeFilterCount =
    (selectedGradeFilter !== 'ALL' ? 1 : 0) +
    (selectedSubjectFilter !== 'ALL' ? 1 : 0) +
    (selectedTestartFilter !== 'ALL' ? 1 : 0) +
    (searchQuery.trim() !== '' ? 1 : 0);

  let fileInput: HTMLInputElement;

  // Which exam rows are expanded (the list is collapsibles, like the exercise
  // library).
  let expandedExams: { [examId: string]: boolean } = {};

  /** Set while a re-fetch is running, so the list shows its loading row. */
  let isRefreshing = false;

  // Delete modal state
  let isDeleteModalOpen = false;
  let deletingExam: { id: string; title?: string; submissionCount: number } | null = null;
  let isDeleteLoading = false;

  $: availableGrades = Array.from(
    new Set(exams.map((e) => e.grade).filter((g): g is string => Boolean(g)))
  ).sort();

  $: availableSubjects = Array.from(
    new Set(exams.map((e) => e.fach).filter((f): f is string => Boolean(f)))
  ).sort();

  $: testartOptions = Array.from(
    new Set(exams.map((e) => e.testart).filter((t): t is string => Boolean(t)))
  )
    .sort()
    .map((testart) => ({
      value: testart,
      label: testart,
      count: exams.filter((e) => e.testart === testart).length,
    }));

  $: filteredExams = exams.filter((e) => {
    const matchesGrade =
      selectedGradeFilter === 'ALL' ||
      e.grade === selectedGradeFilter ||
      (!e.grade && e.klasse === selectedGradeFilter);
    const matchesSubject = selectedSubjectFilter === 'ALL' || e.fach === selectedSubjectFilter;
    const matchesTestart = selectedTestartFilter === 'ALL' || e.testart === selectedTestartFilter;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      (e.title && e.title.toLowerCase().includes(q)) ||
      (e.grade && e.grade.toLowerCase().includes(q)) ||
      (e.klasse && e.klasse.toLowerCase().includes(q)) ||
      (e.fach && e.fach.toLowerCase().includes(q)) ||
      (e.testart && e.testart.toLowerCase().includes(q));
    return matchesGrade && matchesSubject && matchesTestart && matchesSearch;
  });

  onMount(async () => {
    try {
      // Must run before the check below, or it can run against a session the
      // layout hasn't restored yet, bouncing a reload to /unlock.
      await awaitSessionReady();
      if (!$isUnlocked) {
        goto("/unlock");
        return;
      }
      await refreshExams();
    } finally {
      isInitializing = false;
    }
  });

  async function refreshExams() {
    isRefreshing = true;
    try {
      await doRefreshExams();
    } finally {
      isRefreshing = false;
    }
  }

  async function doRefreshExams() {
    await awaitSessionReady();
    examsLoadFailed = false;
    const key = get(sessionStore).sessionKey;
    const localExams = await loadExamsEncrypted(key);

    if ($isAuthenticated && $storagePolicyStore.storageMode !== 'all-local') {
      try {
        // Silent: the catch below falls back to what is in IndexedDB and the
        // banner reports the failure in place. The global modal on top of that
        // is the same error told twice.
        const remoteExamsRaw = (await api.get('/exams', { silentError: true })) as any[];
        const remoteExams: ExamRecord[] = remoteExamsRaw.map(mapApiToExamRecord);

        // Check offline queue for pending exam creations
        const pendingQueue = get(offlineQueue);
        const pendingExamIds = new Set(
          pendingQueue
            .filter((req) => req.url === '/exams' && req.method === 'POST' && req.body?.id)
            .map((req) => req.body.id)
        );

        // Merge remote and local exams (preserve only local IDB exams pending offline sync)
        const remoteIds = new Set(remoteExams.map((e) => e.id));
        const pendingLocalExams = localExams.filter((e) => !remoteIds.has(e.id) && pendingExamIds.has(e.id));
        const deletedStaleExams = localExams.filter((e) => !remoteIds.has(e.id) && !pendingExamIds.has(e.id));

        // Purge deleted/stale exams from local IDB
        for (const stale of deletedStaleExams) {
          await db.exams.delete(stale.id);
          await db.exercises.where('examId').equals(stale.id).delete();
          await db.examExercises.where('examId').equals(stale.id).delete();
        }

        exams = [...remoteExams, ...pendingLocalExams];

        const encryptedExams = await Promise.all(exams.map((ex) => encryptExam(ex, key)));
        await db.exams.bulkPut(encryptedExams);


        // Also sync remote exercises, junction records and MC groups to IndexedDB
        // for offline export — nothing else writes these tables in all-server
        // mode, so without this a .bgproj export ships them empty.
        const remoteExercises: any[] = [];
        const junctionRecords: any[] = [];
        const mcGroupRecords: any[] = [];
        for (const e of remoteExamsRaw) {
          if (Array.isArray(e.mc_groups)) {
            for (const g of e.mc_groups) {
              mcGroupRecords.push({
                id: g.id,
                examId: e.id,
                title: g.title,
                scoringText: g.scoring_text,
                orderIndex: g.order_index,
              });
            }
          }
          if (Array.isArray(e.exercises)) {
            for (let idx = 0; idx < e.exercises.length; idx++) {
              const ex = e.exercises[idx];
              const orderIndex = ex.order_index ?? (idx + 1);
              remoteExercises.push({
                id: ex.id,
                teacherId: ex.teacher_id,
                name: ex.name,
                topicTag: ex.topic_tag,
                grade: ex.grade,
                subject: ex.subject,
                latexBody: ex.latex_body,
                maxPoints: ex.max_points,
                version: ex.version || 1,
                questionType: ex.question_type || 'free_text',
                penalty: ex.penalty || 0,
                exerciseGroupId: ex.exercise_group_id,
                variantKey: ex.variant_key,
                isCurrent: ex.is_current,
              });
              junctionRecords.push({
                examId: e.id,
                exerciseId: ex.id,
                orderIndex,
                // MC membership MUST be carried over. These records are written
                // with bulkPut on the [examId+exerciseId] primary key, so a
                // junction rebuilt without mcGroupId/subIndex overwrites the
                // stored one and erases the exercise's MC group membership —
                // after which the group renders empty and its members show up
                // as standalone exercises.
                mcGroupId: ex.mc_group_id ?? ex.mcGroupId ?? undefined,
                subIndex: ex.sub_index ?? ex.subIndex ?? undefined,
              });
            }
          }
        }
        if (remoteExercises.length > 0) {
          const encExercises = await Promise.all(remoteExercises.map((ex) => encryptExercise(ex, key)));
          await db.exercises.bulkPut(encExercises);
        }
        // Prune before writing: the server is authoritative for these tables in
        // server-backed modes, so a link or group it no longer knows about must
        // not survive locally and resurface as a phantom exercise/group.
        const syncedExamIds = remoteExamsRaw.map((e: any) => e.id).filter(Boolean);
        for (const syncedExamId of syncedExamIds) {
          const keptExerciseIds = new Set(
            junctionRecords.filter((j) => j.examId === syncedExamId).map((j) => j.exerciseId)
          );
          const staleLinks = await db.examExercises.where('examId').equals(syncedExamId).toArray();
          for (const link of staleLinks) {
            if (!keptExerciseIds.has(link.exerciseId)) {
              await db.examExercises.delete([syncedExamId, link.exerciseId]);
            }
          }
          const keptGroupIds = new Set(
            mcGroupRecords.filter((g) => g.examId === syncedExamId).map((g) => g.id)
          );
          const staleGroups = await db.examMcGroups.where('examId').equals(syncedExamId).toArray();
          for (const group of staleGroups) {
            if (!keptGroupIds.has(group.id)) {
              await db.examMcGroups.delete(group.id);
            }
          }
        }
        if (junctionRecords.length > 0) {
          await db.examExercises.bulkPut(junctionRecords);
        }
        if (mcGroupRecords.length > 0) {
          await db.examMcGroups.bulkPut(mcGroupRecords);
        }
      } catch (apiErr) {
        console.warn('Failed to fetch remote exams, falling back to IDB:', apiErr);
        // What is in IndexedDB, and an honest note that it is not everything.
        // In all-server mode nothing is cached there, so without the banner a
        // rejected request is indistinguishable from an empty account — which
        // is how a session problem read as "all my data is gone".
        exams = localExams;
        examsLoadFailed = true;
      }
    } else {
      exams = localExams;
    }

    try {
      // `exams` is already loaded above; passing it stops this from fetching
      // /exams a second time on every dashboard render.
      const allSubmissions = await submissionRepository.getAll(key, exams);
      const tempMap = new Map<string, { sum: number; count: number }>();
      for (const s of allSubmissions) {
        if (typeof s.totalScore === 'number' && !isNaN(s.totalScore)) {
          const curr = tempMap.get(s.examId) || { sum: 0, count: 0 };
          curr.sum += s.totalScore;
          curr.count += 1;
          tempMap.set(s.examId, curr);
        }
      }
      const newStats = new Map<string, { avgScore: number | null; count: number }>();
      for (const [eId, data] of tempMap.entries()) {
        if (data.count > 0) {
          newStats.set(eId, {
            avgScore: Math.round((data.sum / data.count) * 10) / 10,
            count: data.count,
          });
        }
      }
      examStatsMap = newStats;
    } catch (e) {
      console.warn('Could not load submission stats for dashboard:', e);
    }

    for (const exam of exams) {
      if (exam.retentionUntil) {
        const check = checkRetention(exam.retentionUntil);
        if (check.isExpired) {
          expiredExam = { exam, check };
          break;
        }
      }
    }
  }

  async function handleImportArchive(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    isImporting = true;
    importStatus = translate('dashboard.importDecrypting');
    try {
      // The conflict dialog is the one mounted in the root layout.
      if (await importArchiveInteractively(file)) await refreshExams();
    } finally {
      isImporting = false;
      importStatus = '';
    }
  }

  async function handleExtendRetention() {
    if (!expiredExam) return;
    const newDate = new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0];
    expiredExam.exam.retentionUntil = newDate;
    const key = get(sessionStore).sessionKey;
    await saveExamEncrypted(expiredExam.exam, key);
    expiredExam = null;
    await refreshExams();
  }

  async function handleDeleteExpiredExam() {
    if (!expiredExam) return;
    const examId = expiredExam.exam.id;

    // Shared cascade so no owned table is missed.
    await examRepository.deleteLocalCascade(examId);
    expiredExam = null;
    await refreshExams();
  }

  function toggleExam(examId: string) {
    expandedExams = { ...expandedExams, [examId]: !expandedExams[examId] };
  }

  function handleDeleteDashboardExam(id: string, title?: string) {
    deletingExam = { id, title, submissionCount: examStatsMap.get(id)?.count ?? 0 };
    isDeleteModalOpen = true;
  }

  async function handleConfirmDeleteExam() {
    if (!deletingExam) return;
    isDeleteLoading = true;
    try {
      await examRepository.delete(deletingExam.id);
      isDeleteModalOpen = false;
      deletingExam = null;
      await refreshExams();
    } catch (err: any) {
      alert(translate('dashboard.deleteFailed', { message: err.message }));
    } finally {
      isDeleteLoading = false;
    }
  }
</script>

<PageShell width="fluid">
  {#if isInitializing}
    <DashboardSessionState mode="loading" />
  {:else if !$isUnlocked}
    <DashboardSessionState mode="locked" />
  {:else}
    <PageHeader
      title={$t("dashboard.header.title")}
      subtitle={$t("dashboard.header.subtitle")}
      helpTopic="gettingStarted"
    >
      <svelte:fragment slot="actions">
        <Button
          variant="outlined"
          severity="secondary"
          disabled={isImporting}
          icon={faUpload}
          onClick={() => fileInput?.click()}
        >
          {isImporting ? $t("dashboard.header.importing") : $t("dashboard.header.importButton")}
        </Button>
        <input
          bind:this={fileInput}
          type="file"
          id="importFile"
          accept=".bgproj"
          on:change={handleImportArchive}
          disabled={isImporting}
          hidden
        />
        <Button href="/exam/new">{$t("dashboard.header.createButton")}</Button>
      </svelte:fragment>
    </PageHeader>

    {#if importStatus}
      <Alert class="mb-6">{importStatus}</Alert>
    {/if}

    {#if expiredExam}
      <RetentionModal {expiredExam} onExtend={handleExtendRetention} onDelete={handleDeleteExpiredExam} />
    {/if}

    {#if examsLoadFailed}
      <Alert severity="danger" class="mb-6">{$t("dashboard.loadFailed")}</Alert>
    {/if}

    {#if exams.length === 0 && !examsLoadFailed}
      <OnboardingEmptyState />
    {:else}
      <!-- Below `lg` the filter panel moves into a drawer; see FilterDrawer. -->
      <FilterDrawer
        bind:open={isFilterDrawerOpen}
        title={$t("dashboard.header.filtersTitle")}
        toggleLabel={$t("dashboard.header.showFilters")}
        activeCount={activeFilterCount}
      >
        <ExamFilterSidebar
          bind:searchQuery
          bind:selectedGradeFilter
          bind:selectedSubjectFilter
          bind:selectedTestartFilter
          {availableGrades}
          {availableSubjects}
          {testartOptions}
          totalExamCount={exams.length}
        />
      </FilterDrawer>

      <div class="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,17.5rem)_minmax(0,1fr)]">
        <div class="sticky top-2 hidden max-h-[calc(100dvh-1rem)] min-w-0 overflow-y-auto lg:block">
          <div class="flex min-w-0 flex-col gap-6">
            <KpiSidebar
              totalExams={exams.length}
              subjectCount={availableSubjects.length}
              gradeCount={availableGrades.length}
            />

            <ExamFilterSidebar
              bind:searchQuery
              bind:selectedGradeFilter
              bind:selectedSubjectFilter
              bind:selectedTestartFilter
              {availableGrades}
              {availableSubjects}
              {testartOptions}
              totalExamCount={exams.length}
            />
          </div>
        </div>

        <div class="min-w-0">
          <ExamList
            exams={filteredExams}
            {examStatsMap}
            isLoading={isRefreshing}
            {expandedExams}
            onToggleExam={toggleExam}
            onDelete={handleDeleteDashboardExam}
          />
        </div>
      </div>
    {/if}
  {/if}
</PageShell>

<ConfirmDeleteModal
  open={isDeleteModalOpen && !!deletingExam}
  title={deletingExam ? $t("dashboard.deleteModal.title", { title: deletingExam.title || $t("dashboard.examList.untitledExam") }) : ""}
  isDeleteLoading={isDeleteLoading}
  confirmLabel={$t("dashboard.deleteModal.deleteAnyway")}
  cancelLabel={$t("common.cancel")}
  onConfirm={handleConfirmDeleteExam}
  onClose={() => (isDeleteModalOpen = false)}
>
  {#if deletingExam && deletingExam.submissionCount > 0}
    <Alert severity="danger" title={$t("dashboard.deleteModal.warningTitle")}>
      <p class="m-0">{$t("dashboard.deleteModal.usageInfo", { count: deletingExam.submissionCount })}</p>
      <p class="m-0 mt-1 text-sm text-muted">{$t("dashboard.deleteModal.usageWarning")}</p>
    </Alert>
  {:else}
    <p>{$t("dashboard.deleteModal.confirmPlain")}</p>
  {/if}
</ConfirmDeleteModal>
