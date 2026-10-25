<script lang="ts">
  import { isUnlocked, sessionStore, awaitSessionReady } from '#lib/stores/session';
  import { db } from '#lib/db/db';
  import type { ExamRecord, ExerciseRecord } from '#lib/db/schema';
  import { saveExamEncrypted } from '#lib/db/dbEncryption';
  import { importArchiveInteractively } from '#lib/services/archiveService';
  import { addExampleData } from '#lib/services/exampleData';
  import { showArchiveReport } from '#lib/stores/archiveReport';
  import { checkRetention, type RetentionCheckResult } from '#lib/gdpr/retention';
  import { onMount, untrack } from 'svelte';
  import { get } from 'svelte/store';

  import { examRepository } from '#lib/repositories/examRepository';
  import { exerciseRepository } from '#lib/repositories/exerciseRepository';
  import { submissionRepository } from '#lib/repositories/submissionRepository';
  import { goto } from '$app/navigation';
  import { t, translate } from '#lib/i18n';
  import { loadSyncedExams } from '#lib/services/examSync';
  import { computeExamStats } from '#lib/utils/examStats';
  import { createExpandSet } from '#lib/utils/expandSet';
  import { createLazyMap } from '#lib/utils/lazyMap';
  import { loadExamLogoPreview, type ExamLogoPreview } from '#lib/latex/logo';
  import { countActiveFilters, facetOptions, matchesQuery, uniqueSorted } from '#lib/utils/listFilter';
  import { EXAM_SORT_KEYS, SORT_STORAGE, loadSort, saveSort, sortExams } from '#lib/utils/listSort';
  import { faPlus, faUpload } from '@fortawesome/free-solid-svg-icons';

  import DashboardSessionState from '#lib/components/dashboard/DashboardSessionState.svelte';
  import RetentionModal from '#lib/components/dashboard/RetentionModal.svelte';
  import OnboardingEmptyState from '#lib/components/dashboard/OnboardingEmptyState.svelte';
  import DeleteWithUsageModal from '#lib/components/common/DeleteWithUsageModal.svelte';
  import ListFilterPanel from '#lib/components/common/ListFilterPanel.svelte';
  import ExamList from '#lib/components/dashboard/ExamList.svelte';
  import { Alert, Button, FilterLayout, PageHeader, PageShell } from '#lib/components/ui';
  import ExamExportModal from '#lib/components/exam/ExamExportModal.svelte';
  import PreviewHost from '#lib/components/common/PreviewHost.svelte';
  import { createPreviewFlow } from '#lib/stores/previewFlow';
  import { compileExamPreview, getCurrentExamPreview } from '#lib/exam/examPreview';
  import { buildExamItems, loadExamCompileContext } from '#lib/grading/omrTemplatePrep';

  let exams: ExamRecord[] = $state.raw([]);
  let rawExportExamId: string | null = $state(null);
  let duplicatingExamId: string | null = $state(null);
  let addingExampleData = $state(false);
  let exampleDataError = $state('');
  let duplicateError = $state('');
  /** Set when the server refused the exam list, so the view can say so. */
  let examsLoadFailed = $state(false);
  let examStatsMap = $state.raw(new Map<string, { avgScore: number | null; count: number }>());
  let isImporting = $state(false);
  let importStatus = $state('');
  let isInitializing = $state(true);
  let expiredExam: { exam: ExamRecord; check: RetentionCheckResult } | null = $state.raw(null);

  let searchQuery = $state('');
  let selectedGradeFilter = $state('ALL');
  let selectedSubjectFilter = $state('ALL');
  let selectedTestartFilter = $state('ALL');
  let selectedTopicFilter = $state('ALL');
  let sortKey = $state<string>(loadSort(SORT_STORAGE.exams, EXAM_SORT_KEYS, 'newest'));

  /** Exercises per expanded exam, fetched on first expand and dropped on refresh. */
  const exerciseMap = createLazyMap<ExerciseRecord[]>((examId) =>
    exerciseRepository.getByExamId(examId, get(sessionStore).sessionKey)
  );

  // Badge on the mobile filter button, so an active filter is visible without
  // opening the drawer.
  let activeFilterCount = $derived(countActiveFilters(searchQuery, selectedGradeFilter, selectedSubjectFilter, selectedTestartFilter, selectedTopicFilter));

  let fileInput: HTMLInputElement | undefined = $state();

  /** The header logo each expanded exam prints, loaded with its exercises. */
  const logoMap = createLazyMap<ExamLogoPreview>(loadExamLogoPreview);

  // Which exam rows are expanded (the list is collapsibles, like the exercise
  // library).
  const expandedExams = createExpandSet((examId) => {
    exerciseMap.ensure(examId);
    logoMap.ensure(examId);
  });

  /** Set while a re-fetch is running; the list stays visible and is marked busy. */
  let isRefreshing = $state(false);
  let refreshAgain = false;

  // Delete modal state
  let isDeleteModalOpen = $state(false);
  let deletingExam: { id: string; title?: string; submissionCount: number } | null = $state(null);
  let isDeleting = $state(false);
  let deleteError = $state('');

  let availableGrades = $derived(uniqueSorted(exams, (e) => e.grade));
  let availableSubjects = $derived(uniqueSorted(exams, (e) => e.fach));
  let availableTopics = $derived(uniqueSorted(exams, (e) => e.topic));
  // Everything but the testart pills' own filter, so their counts follow the other filters.
  let examsBeforeTestart = $derived(exams.filter(
    (e) =>
      (selectedGradeFilter === 'ALL' ||
        e.grade === selectedGradeFilter ||
        (!e.grade && e.klasse === selectedGradeFilter)) &&
      (selectedSubjectFilter === 'ALL' || e.fach === selectedSubjectFilter) &&
      (selectedTopicFilter === 'ALL' || e.topic === selectedTopicFilter) &&
      matchesQuery(searchQuery, e.title, e.grade, e.klasse, e.fach, e.testart, e.topic)
  ));
  let testartOptions = $derived(facetOptions(examsBeforeTestart, (e) => e.testart, selectedTestartFilter));
  let filteredExams = $derived(
    sortExams(
      selectedTestartFilter === 'ALL' ? examsBeforeTestart : examsBeforeTestart.filter((e) => e.testart === selectedTestartFilter),
      sortKey
    )
  );
  let sortOptions = $derived(
    EXAM_SORT_KEYS.map((value) => ({ value, label: $t(`common.sort.${value}`) }))
  );

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

  /** Overlapping calls coalesce into one more run, so a slow earlier fetch can't overwrite newer data. */
  async function refreshExams() {
    if (isRefreshing) {
      refreshAgain = true;
      return;
    }
    isRefreshing = true;
    try {
      do {
        refreshAgain = false;
        await doRefreshExams();
      } while (refreshAgain);
    } finally {
      isRefreshing = false;
    }
  }

  async function doRefreshExams() {
    await awaitSessionReady();
    const key = get(sessionStore).sessionKey;
    const { exams: loaded, failed } = await loadSyncedExams(key);
    exams = loaded;
    examsLoadFailed = failed;

    try {
      // `exams` is already loaded above; passing it stops this from fetching
      // /exams a second time on every dashboard render.
      const allSubmissions = await submissionRepository.getAll(key, exams);
      examStatsMap = computeExamStats(allSubmissions);
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

    expandedExams.prune(exams.map((e) => e.id));
    exerciseMap.reset();
    logoMap.reset();
    for (const id of expandedExams.ids()) {
      exerciseMap.ensure(id);
      logoMap.ensure(id);
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

  const examPreview = createPreviewFlow<ExamRecord>({
    kind: 'exam',
    idOf: (exam) => exam.id,
    titleOf: (exam) => exam.title || translate('dashboard.examList.untitledExam'),
    compile: async (exam, onStatus, onAngabe) => {
      const key = get(sessionStore).sessionKey;
      const ctx = await loadExamCompileContext(exam.id, key);
      if (!ctx) throw new Error(translate('exam.page.examNotFoundOrDeleted'));
      return compileExamPreview({
        ...ctx,
        examItems: buildExamItems(ctx.exercises, ctx.mcGroups),
        key,
        onStatus,
        onAngabe,
      });
    },
    cached: async (exam) => {
      const key = get(sessionStore).sessionKey;
      const ctx = await loadExamCompileContext(exam.id, key);
      if (!ctx) return null;
      return getCurrentExamPreview({ ...ctx, examItems: buildExamItems(ctx.exercises, ctx.mcGroups), key });
    },
  });

  /** Imports the bundled example data (issue #120); the report opens only when something went wrong. */
  async function handleAddExampleData() {
    addingExampleData = true;
    exampleDataError = '';
    try {
      const result = await addExampleData();
      if (result.errors.length > 0 || result.report.problems.length > 0) await showArchiveReport(result.report);
      await refreshExams();
    } catch (err: any) {
      exampleDataError = translate('dashboard.exampleData.failed', { message: err?.message ?? '' });
    } finally {
      addingExampleData = false;
    }
  }

  /** Copies the exam without its results and opens the copy for editing (issue #121). */
  async function handleDuplicateExam(exam: ExamRecord) {
    duplicatingExamId = exam.id;
    duplicateError = '';
    try {
      const copy = await examRepository.duplicate(exam.id);
      await goto(`/exam/${copy.id}`);
    } catch (err: any) {
      duplicateError = translate('dashboard.duplicateFailed', { message: err?.message ?? '' });
    } finally {
      duplicatingExamId = null;
    }
  }

  function handleDeleteDashboardExam(id: string, title?: string) {
    deletingExam = { id, title, submissionCount: examStatsMap.get(id)?.count ?? 0 };
    deleteError = '';
    isDeleteModalOpen = true;
  }

  async function handleConfirmDeleteExam() {
    if (!deletingExam) return;
    isDeleting = true;
    deleteError = '';
    try {
      await examRepository.delete(deletingExam.id);
      isDeleteModalOpen = false;
      deletingExam = null;
      await refreshExams();
    } catch (err: any) {
      deleteError = translate('dashboard.deleteFailed', { message: err.message });
    } finally {
      isDeleting = false;
    }
  }

  $effect.pre(() => {
    const key = sortKey;
    untrack(() => saveSort(SORT_STORAGE.exams, key));
  });
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
      {#snippet actions()}
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
          onchange={handleImportArchive}
          disabled={isImporting}
          hidden
        />
        <Button href="/exam/new" icon={faPlus}>{$t("dashboard.header.createButton")}</Button>
      {/snippet}
    </PageHeader>

    {#if importStatus}
      <Alert class="mb-6">{importStatus}</Alert>
    {/if}

    {#if expiredExam}
      <RetentionModal {expiredExam} onExtend={handleExtendRetention} onDelete={handleDeleteExpiredExam} />
    {/if}

    {#if duplicateError}
      <Alert severity="danger" class="mb-6">{duplicateError}</Alert>
    {/if}

    {#if examsLoadFailed}
      <Alert severity="danger" class="mb-6">{$t("dashboard.loadFailed")}</Alert>
    {/if}

    {#if exams.length === 0}
      {#if !examsLoadFailed}
        <OnboardingEmptyState onAddExampleData={handleAddExampleData} {addingExampleData} {exampleDataError} />
      {/if}
    {:else}
      <FilterLayout
        title={$t('dashboard.header.filtersTitle')}
        toggleLabel={$t('dashboard.header.showFilters')}
        activeCount={activeFilterCount}
        busy={isRefreshing}
      >
        {#snippet filters()}
          <ListFilterPanel
            bind:searchQuery
            bind:selectedGrade={selectedGradeFilter}
            bind:selectedSubject={selectedSubjectFilter}
            bind:selectedTopic={selectedTopicFilter}
            searchPlaceholder={$t('dashboard.filterBar.searchPlaceholder')}
            gradeOptions={availableGrades}
            subjectOptions={availableSubjects}
            topicOptions={availableTopics}
            pillOptions={testartOptions}
            pillSelected={selectedTestartFilter}
            pillAllLabel={$t('dashboard.filterBar.allTestarts', { count: examsBeforeTestart.length })}
            {sortOptions}
            bind:sortKey
            onPillSelect={(value) => (selectedTestartFilter = value)}
          />
        {/snippet}

        <ExamList
          exams={filteredExams}
          {examStatsMap}
          exerciseMap={$exerciseMap}
          logoMap={$logoMap}
          isLoading={isRefreshing && exams.length === 0}
          expandedExams={$expandedExams}
          onToggleExam={expandedExams.toggle}
          onDelete={handleDeleteDashboardExam}
          onPreview={examPreview.open}
          onRawExport={(exam) => (rawExportExamId = exam.id)}
          onDuplicate={handleDuplicateExam}
          duplicatingId={duplicatingExamId}
        />
      </FilterLayout>
    {/if}
  {/if}
</PageShell>

<PreviewHost flow={examPreview} />

{#if rawExportExamId}
  <ExamExportModal examId={rawExportExamId} onClose={() => (rawExportExamId = null)} />
{/if}

<DeleteWithUsageModal
  open={isDeleteModalOpen && !!deletingExam}
  title={deletingExam ? $t('dashboard.deleteModal.title', { title: deletingExam.title || $t('dashboard.examList.untitledExam') }) : ''}
  usageTitle={$t('dashboard.deleteModal.warningTitle')}
  usageText={deletingExam && deletingExam.submissionCount > 0 ? $t('dashboard.deleteModal.usageInfo', { count: deletingExam.submissionCount }) : ''}
  usageHint={$t('dashboard.deleteModal.usageWarning')}
  plainText={$t('dashboard.deleteModal.confirmPlain')}
  busy={isDeleting}
  error={deleteError}
  onConfirm={handleConfirmDeleteExam}
  onClose={() => (isDeleteModalOpen = false)}
/>
