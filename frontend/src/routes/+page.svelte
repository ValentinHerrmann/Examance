<script lang="ts">
  import { isUnlocked, sessionStore, awaitSessionReady } from '#lib/stores/session';
  import { db } from '#lib/db/db';
  import type { ExamRecord, ExerciseRecord } from '#lib/db/schema';
  import { saveExamEncrypted } from '#lib/db/dbEncryption';
  import { importArchiveInteractively } from '#lib/services/archiveService';
  import { IMPORT_ACCEPT } from '#lib/archive/format';
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
  import { computeExamStats, type ExamStats } from '#lib/utils/examStats';
  import { studentRepository } from '#lib/repositories/studentRepository';
  import { createExpandSet } from '#lib/utils/expandSet';
  import { createLazyMap } from '#lib/utils/lazyMap';
  import { loadExamLogoPreview, type ExamLogoPreview } from '#lib/latex/logo';
  import { countActiveFilters, facetOptions, matchesQuery, uniqueSorted } from '#lib/utils/listFilter';
  import { EXAM_SORT_KEYS, SORT_STORAGE, loadSort, saveSort, sortExams } from '#lib/utils/listSort';
  import { faPlus, faUpload } from '@fortawesome/free-solid-svg-icons';

  import DashboardSessionState from '#lib/components/dashboard/DashboardSessionState.svelte';
  import RetentionModal from '#lib/components/dashboard/RetentionModal.svelte';
  import OnboardingEmptyState from '#lib/components/dashboard/OnboardingEmptyState.svelte';
  import ExamBulkActions from '#lib/components/dashboard/ExamBulkActions.svelte';
  import { Selection } from '#lib/utils/selection.svelte';
  import ListFilterPanel from '#lib/components/common/ListFilterPanel.svelte';
  import ExamList from '#lib/components/dashboard/ExamList.svelte';
  import { Alert, Button, FilterLayout, PageHeader, PageShell, SelectionToolbar, actionIcons } from '#lib/components/ui';
  import PreviewHost from '#lib/components/common/PreviewHost.svelte';
  import { createPreviewFlow } from '#lib/stores/previewFlow';
  import { compileExamPreview, getCurrentExamPreview } from '#lib/exam/examPreview';
  import { examReportFiles } from '#lib/layout-report/collect';
  import { buildExamItems, loadExamCompileContext } from '#lib/grading/omrTemplatePrep';

  let exams: ExamRecord[] = $state.raw([]);
  let duplicatingExamId: string | null = $state(null);
  let addingExampleData = $state(false);
  let exampleDataError = $state('');
  let duplicateError = $state('');
  let flagError = $state('');
  /** Set when the server refused the exam list, so the view can say so. */
  let examsLoadFailed = $state(false);
  // The submission read failed: the per-exam figures are unknown, which is not "no submissions".
  let statsLoadFailed = $state(false);
  let examStatsMap = $state.raw(new Map<string, ExamStats>());
  // Students per exam for the cards' progress row; empty when the read failed (the row then leaves students out).
  let studentCounts = $state.raw(new Map<string, number>());
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

  // Badge on the mobile filter button, so an active filter is visible without opening the drawer.
  let activeFilterCount = $derived(countActiveFilters(searchQuery, selectedGradeFilter, selectedSubjectFilter, selectedTestartFilter, selectedTopicFilter));

  let fileInput: HTMLInputElement | undefined = $state();

  /** The header logo each expanded exam prints, loaded with its exercises. */
  const logoMap = createLazyMap<ExamLogoPreview>(loadExamLogoPreview);

  // Which exam rows are expanded (the list is collapsibles, like the exercise library).
  const expandedExams = createExpandSet((examId) => {
    exerciseMap.ensure(examId);
    logoMap.ensure(examId);
  });

  /** Set while a re-fetch is running; the list stays visible and is marked busy. */
  let isRefreshing = $state(false);
  let refreshAgain = false;

  let bulkActions: ExamBulkActions | undefined = $state();
  // Checkbox selection over the shown exams (issue #261).
  const selection = new Selection();

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
      // Must run before the check below, or it can run against a session the layout hasn't restored yet, bouncing a reload to /unlock.
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
      // `exams` is already loaded above; passing it stops this from fetching /exams a second time on every dashboard render.
      const allSubmissions = await submissionRepository.getAll(key, exams);
      examStatsMap = computeExamStats(allSubmissions);
      statsLoadFailed = false;
    } catch (e) {
      console.warn('Could not load submission stats for dashboard:', e);
      examStatsMap = new Map();
      statsLoadFailed = true;
    }
    try {
      const counts = new Map<string, number>();
      for (const st of await studentRepository.getAll(key)) counts.set(st.examId, (counts.get(st.examId) ?? 0) + 1);
      studentCounts = counts;
    } catch (e) {
      console.warn('Could not load students for dashboard:', e);
      studentCounts = new Map();
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

    // Shared cascade so no owned table is missed. Expiry, not a teacher's delete: no trash entry.
    await examRepository.deleteLocalCascade(examId, { permanent: true });
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
    reportFiles: async (exam, angabeUrl, loesungUrl) => {
      const key = get(sessionStore).sessionKey;
      const ctx = await loadExamCompileContext(exam.id, key);
      if (!ctx) throw new Error(translate('exam.page.examNotFoundOrDeleted'));
      return examReportFiles({ ...ctx, examItems: buildExamItems(ctx.exercises, ctx.mcGroups), key }, angabeUrl, loesungUrl);
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

  /** Favorite/archive (issue #252): shown at once, saved per exam; a failure reloads the true state. */
  async function setExamFlags(targets: ExamRecord[], flags: { isFavorite?: boolean; archived?: boolean }) {
    flagError = '';
    const ids = new Set(targets.map((e) => e.id));
    const archivedAt = flags.archived ? new Date().toISOString() : undefined;
    exams = exams.map((e) => {
      if (!ids.has(e.id)) return e;
      const next = { ...e, ...(flags.isFavorite === undefined ? {} : { isFavorite: flags.isFavorite }) };
      if (flags.archived !== undefined) next.archivedAt = flags.archived ? (e.archivedAt ?? archivedAt) : undefined;
      return next;
    });
    try {
      for (const id of ids) await examRepository.saveFlags(id, flags); // NOSONAR: one PATCH per exam, like every exam write
    } catch {
      flagError = translate('common.listSections.flagFailed');
      await refreshExams();
    }
  }

  let selectedExams = $derived(filteredExams.filter((e) => selection.has(e.id)));
  let allSelectedFavorite = $derived(selectedExams.length > 0 && selectedExams.every((e) => e.isFavorite));
  let allSelectedArchived = $derived(selectedExams.length > 0 && selectedExams.every((e) => e.archivedAt));

  $effect.pre(() => {
    const key = sortKey;
    untrack(() => saveSort(SORT_STORAGE.exams, key));
  });

  // A filter change or a deleted exam drops it from the selection, so an action never hits an exam the teacher cannot see.
  $effect.pre(() => {
    const ids = filteredExams.map((e) => e.id);
    untrack(() => selection.prune(ids));
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
          accept={IMPORT_ACCEPT}
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
    {#if flagError}
      <Alert severity="danger" class="mb-6">{flagError}</Alert>
    {/if}

    {#if examsLoadFailed}
      <Alert severity="danger" class="mb-6">{$t("dashboard.loadFailed")}</Alert>
    {/if}

    {#if statsLoadFailed}
      <Alert severity="danger" class="mb-6">{$t("dashboard.statsLoadFailed")}</Alert>
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

        <div class="flex min-w-0 flex-col gap-4">
        <SelectionToolbar
          count={selectedExams.length}
          total={filteredExams.length}
          countText={$t('dashboard.bulk.selection', { count: selectedExams.length })}
          selectAllLabel={$t('common.bulk.selectAll')}
          onSelectAll={(on) => (on ? selection.set(filteredExams.map((e) => e.id)) : selection.clear())}
        >
          {#snippet actions()}
            <Button size="sm" variant="outlined" icon={actionIcons.edit} disabled={!selectedExams.length} onClick={() => bulkActions?.open('edit', selectedExams)}>{$t('common.edit')}</Button>
            <Button size="sm" variant="outlined" icon={actionIcons.export} disabled={!selectedExams.length} onClick={() => bulkActions?.open('export', selectedExams)}>{$t('dashboard.bulk.exportAction')}</Button>
            <Button size="sm" variant="outlined" icon={actionIcons.favorite} disabled={!selectedExams.length} onClick={() => setExamFlags(selectedExams, { isFavorite: !allSelectedFavorite })}>
              {allSelectedFavorite ? $t('common.listSections.unfavoriteSelected') : $t('common.listSections.favoriteSelected')}
            </Button>
            <Button size="sm" variant="outlined" icon={allSelectedArchived ? actionIcons.unarchive : actionIcons.archive} disabled={!selectedExams.length} onClick={() => setExamFlags(selectedExams, { archived: !allSelectedArchived })}>
              {allSelectedArchived ? $t('common.listSections.unarchiveSelected') : $t('common.listSections.archiveSelected')}
            </Button>
            <Button size="sm" variant="outlined" severity="danger" icon={actionIcons.delete} disabled={!selectedExams.length} onClick={() => bulkActions?.open('delete', selectedExams)}>{$t('common.delete')}</Button>
          {/snippet}
        </SelectionToolbar>

        <ExamList
          exams={filteredExams}
          isSelected={(id) => selection.has(id)}
          onSelect={(id, on) => selection.toggle(id, on)}
          {examStatsMap}
          {studentCounts}
          statsKnown={!statsLoadFailed}
          exerciseMap={$exerciseMap}
          logoMap={$logoMap}
          isLoading={isRefreshing && exams.length === 0}
          expandedExams={$expandedExams}
          onToggleExam={expandedExams.toggle}
          onDelete={(exam) => bulkActions?.open('delete', [exam])}
          onPreview={examPreview.open}
          onExport={(exam) => bulkActions?.open('export', [exam])}
          onDuplicate={handleDuplicateExam}
          onExerciseSaved={() => expandedExams.ids().forEach((id) => exerciseMap.reload(id))}
          duplicatingId={duplicatingExamId}
          onFavorite={(exam, on) => setExamFlags([exam], { isFavorite: on })}
          onArchive={(exam, on) => setExamFlags([exam], { archived: on })}
        />
        </div>
      </FilterLayout>
    {/if}
  {/if}
</PageShell>

<PreviewHost flow={examPreview} kind="exam" />

<ExamBulkActions
  bind:this={bulkActions}
  submissionCount={(id) => examStatsMap.get(id)?.submissionCount ?? 0}
  onChanged={async () => {
    selection.clear();
    await refreshExams();
  }}
/>
