<script lang="ts">
  import { type ExerciseGroup, groupExercises, groupFlags } from "#lib/exercise-library/groupExercises";
  import { saveGroupFlags, withGroupFlags, type GroupFlags } from "#lib/exercise-library/saveGroupMetadata";
  import { sharedFromQuestion } from "#lib/exercise-library/askToShare";
  import { onMount, tick, untrack } from "svelte";
  import { db } from "#lib/db/db";
  import { sessionStore, awaitSessionReady } from "#lib/stores/session";
  import { capabilitiesStore, featuresStore } from "#lib/stores/capabilities";
  import { page } from "$app/state";
  import type { ExerciseRecord } from "#lib/db/schema";
  import { apiErrorMessage } from "#lib/api/client";
  import { get } from "svelte/store";
  import { isServerBacked } from "#lib/utils/serverBacked";
  import { countActiveFilters, facetOptions, matchesExerciseFilters, uniqueSorted } from "#lib/utils/listFilter";
  import { GROUP_SORT_KEYS, SORT_STORAGE, loadSort, saveSort, sortGroups } from "#lib/utils/listSort";
  import { t, translate, type TranslationKey } from "#lib/i18n";

  import ExerciseEditorModal from "#lib/components/ExerciseEditorModal.svelte";
  import ListFilterPanel from "#lib/components/common/ListFilterPanel.svelte";
  import { Alert, Button, FilterLayout, Menu, MenuItem, PageHeader, PageShell, SelectionToolbar, Tabs, actionIcons } from "#lib/components/ui";
  import PreviewHost from "#lib/components/common/PreviewHost.svelte";
  import { createLibraryPreviewFlow } from "#lib/exercise-library/libraryPreview";
  import { loadLibraryExercises } from "#lib/exercise-library/loadLibrary";
  import { loadExamUsage, usageKey, type ExamUsageEntry } from "#lib/exercise-library/examUsage";
  import { createExpandSet } from "#lib/utils/expandSet";
  import { createLazyMap } from "#lib/utils/lazyMap";
  import { faBook, faCodePullRequest, faPause, faPlay, faPlus, faShareNodes, faEyeSlash, faFileZipper, faFileImport } from "@fortawesome/free-solid-svg-icons";
  import { importArchiveInteractively } from "#lib/services/archiveService";
  import { IMPORT_ACCEPT } from "#lib/archive/format";
  import ExerciseGroupList from "#lib/components/exercise-library/ExerciseGroupList.svelte";
  import ExamSummaryModal from "#lib/components/exam/ExamSummaryModal.svelte";
  import ExerciseExportModal from "#lib/components/exercise-library/ExerciseExportModal.svelte";
  import GroupEditFlow from "#lib/components/exercise-library/GroupEditFlow.svelte";
  import BulkGroupFlow from "#lib/components/exercise-library/BulkGroupFlow.svelte";
  import { Selection } from "#lib/utils/selection.svelte";
  import RegroupFlow from "#lib/components/exercise-library/RegroupFlow.svelte";
  import ExerciseDeleteFlow from "#lib/components/exercise-library/ExerciseDeleteFlow.svelte";
  import VariantFlow from "#lib/components/exercise-library/VariantFlow.svelte";
  import DiffFlow from "#lib/components/exercise-library/DiffFlow.svelte";
  import SharingFlow from "#lib/components/exercise-library/SharingFlow.svelte";
  import ContributionFlow from "#lib/components/exercise-library/ContributionFlow.svelte";
  import ContributionList from "#lib/components/exercise-library/ContributionList.svelte";
  import {
    listContributions,
    loadContributionSummary,
    type ContributionSummary,
    type PendingForGroup,
  } from "#lib/api/exerciseContributions";
  import {
    listSharedExercises,
    loadSyncStatus,
    type SharedExercise,
    type SyncStatus,
  } from "#lib/api/exerciseSharing";

  let exercises: ExerciseRecord[] = $state.raw([]);

  // Sharing (issue #65): other accounts' exercises are listed separately and only ever copied.
  let view = $state<"own" | "shared" | "proposals">("own");
  let sharingEnabled = $derived($featuresStore.exercise_sharing === true);
  let sharedRows: SharedExercise[] = $state.raw([]);
  let sharedLoading = $state(false);
  let sharedError = $state("");
  let syncStatus: Map<string, SyncStatus> = $state.raw(new Map());
  let sharingNotice = $state("");
  let sharingError = $state("");
  let copyingGroupId = $state("");
  let duplicatingGroupId = $state("");
  /** Groups being exported as ZIP: one group, or the whole library. */
  let summaryExamId = $state<string | null>(null);
  let exportTarget: { groups: ExerciseGroup[]; library: boolean } | null = $state.raw(null);
  let sharingPaused = $derived($capabilitiesStore?.sharingPaused === true);
  let flagError = $state("");
  let isPauseBusy = $state(false);
  let sharingFlow: ReturnType<typeof SharingFlow> | undefined = $state();
  // Proposals back to shared originals.
  let incoming: ContributionSummary[] = $state.raw([]);
  let outgoing: ContributionSummary[] = $state.raw([]);
  let proposalsLoading = $state(false);
  let proposalsFailed = $state(false);
  let pendingProposals = $state(0);
  let pendingByGroup: Map<string, PendingForGroup> = $state.raw(new Map());
  /** Set from the tag on a library card: the Proposals view shows only that group. */
  let proposalFocusGroupId = $state("");
  let proposalFocusName = $state("");
  let withdrawingId = $state("");
  let contributionFlow: ReturnType<typeof ContributionFlow> | undefined = $state();
  let selectedTopic: string = $state("ALL");
  let selectedGrade: string = $state("ALL");
  let selectedSubject: string = $state("ALL");
  let searchQuery: string = $state("");
  let sortKey: string = $state(loadSort(SORT_STORAGE.exercises, GROUP_SORT_KEYS, "nameAsc"));

  // Badge on the mobile filter button, so an active filter is visible without opening the drawer.
  let activeFilterCount = $derived(countActiveFilters(searchQuery, selectedTopic, selectedGrade, selectedSubject));
  let isLoading = $state(false);
  let loadAgain = false;
  let errorMsg = $state("");
  let isLocalFallback = $state(false);
  /** Sharing UI (tabs, menu, sync status) needs the capability and a live server. */
  let sharingAvailable = $derived(sharingEnabled && !isLocalFallback);
  /** A deep link (`?view=proposals`) must not strand the user on a view without its tab bar. */
  let activeView = $derived(sharingAvailable ? view : "own");

  /** The server's message, else the given fallback text. */
  const failText = (err: unknown, fallback: TranslationKey) => apiErrorMessage(err, translate(fallback));

  // Shared Editor modal state
  let isEditorOpen = $state(false);
  let editingExercise: ExerciseRecord | null = $state.raw(null);
  let isCreatingVersion = $state(false);
  let versionBaseEx: ExerciseRecord | null = $state.raw(null);

  // Delete modal state
  let deleteFlow: ReturnType<typeof ExerciseDeleteFlow> | undefined = $state();

  // Group metadata, regroup, diff and variant dialogs: each flow owns its state and opens via `open(...)`.
  let groupEditFlow: ReturnType<typeof GroupEditFlow> | undefined = $state();
  let bulkFlow: ReturnType<typeof BulkGroupFlow> | undefined = $state();
  // Checkbox selection over the shown own groups (issue #261).
  const selection = new Selection();
  let regroupFlow: ReturnType<typeof RegroupFlow> | undefined = $state();
  let diffFlow: ReturnType<typeof DiffFlow> | undefined = $state();
  let variantFlow: ReturnType<typeof VariantFlow> | undefined = $state();

  const expandedGroups = createExpandSet();

  /** Exams using each variant of a group; loaded lazily once its card is expanded. */
  const usage = createLazyMap<ExamUsageEntry[]>((key) => {
    const [groupId, variantKey] = key.split("\u001f");
    const members = allGroups.find((g) => g.groupId === groupId)?.variants.get(variantKey) ?? [];
    return loadExamUsage(members.map((m) => m.ex.id));
  });

  const exercisePreview = createLibraryPreviewFlow();

  let sharedExercises = $derived(sharedRows.map((r) => r.exercise));
  let sharedBy = $derived(new Map(sharedRows.map((r) => [r.exercise.exerciseGroupId ?? "", r.sharedByEmail])));
  /** The list the filters apply to: the own library or what others share. */
  let viewExercises = $derived(activeView === "shared" ? sharedExercises : exercises);

  let availableGrades = $derived(uniqueSorted(viewExercises, (e) => e.grade));
  let availableSubjects = $derived(uniqueSorted(viewExercises, (e) => e.subject));

  // Groups passing every filter but the topic, so the topic pills and "All" count follow the other filters.
  let groupsBeforeTopic = $derived(groupExercises(viewExercises.filter(
    (ex) => matchesExerciseFilters(ex, { query: searchQuery, grade: selectedGrade, subject: selectedSubject })
  )));
  let topicPillOptions = $derived(facetOptions(groupsBeforeTopic, (g) => g.topicTag, selectedTopic));
  let filteredGroups = $derived(sortGroups(
    selectedTopic === "ALL" ? groupsBeforeTopic : groupsBeforeTopic.filter((g) => g.topicTag === selectedTopic),
    sortKey
  ));
  let sortOptions = $derived(GROUP_SORT_KEYS.map((value) => ({
    value,
    label: $t(`common.sort.${value}`),
  })));

  let selectedGroups = $derived(activeView === "own" ? filteredGroups.filter((g) => selection.has(g.groupId)) : []);

  // Grouped view: filter then group
  let allGroups = $derived(groupExercises(exercises));


  onMount(() => {
    const requested = page.url.searchParams.get("view");
    const groupParam = page.url.searchParams.get("group");
    if (requested === "proposals" || requested === "shared") view = requested;
    // Loaded once the library is in: only then is it known whether the view is available.
    loadExercises().then(() => {
      if (groupParam) openGroupInLibrary(groupParam);
      else loadActiveView();
    });
  });

  /** Overlapping calls coalesce into one more run, so a slow earlier fetch can't overwrite newer data. */
  let importInput: HTMLInputElement | undefined = $state();
  let isImporting = $state(false);

  /** Library and exam ZIP exports (and archives) import here too; the library reloads afterwards. */
  async function handleImportFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    isImporting = true;
    try {
      if (await importArchiveInteractively(file)) await loadExercises();
    } finally {
      isImporting = false;
    }
  }

  async function loadExercises() {
    if (isLoading) {
      loadAgain = true;
      return;
    }
    isLoading = true;
    try {
      do {
        loadAgain = false;
        await doLoadExercises();
      } while (loadAgain);
    } finally {
      isLoading = false;
    }
  }

  async function doLoadExercises() {
    await awaitSessionReady();
    errorMsg = "";
    try {
      ({ exercises, localFallback: isLocalFallback } = await loadLibraryExercises(get(sessionStore).sessionKey));
    } catch (err: any) {
      errorMsg = failText(err, "exercises.page.loadFailed");
    }
    usage.reset();
    expandedGroups.prune([...groupExercises(exercises), ...groupExercises(sharedExercises)].map((g) => g.groupId));
    void refreshSyncStatus();
  }

  /** Which own copies have changes at their shared source. Online only; a failure keeps the last answer. */
  async function refreshSyncStatus() {
    if (!sharingAvailable || !isServerBacked()) return;
    try {
      syncStatus = new Map((await loadSyncStatus()).map((s) => [s.groupId, s]));
      const summary = await loadContributionSummary();
      pendingProposals = summary.incomingPending;
      pendingByGroup = summary.byGroup;
    } catch {
      sharingError = translate("exercises.sharing.statusFailed");
    }
  }

  async function loadProposals() {
    proposalsLoading = true;
    proposalsFailed = false;
    sharingError = "";
    try {
      [incoming, outgoing] = await Promise.all([listContributions("incoming"), listContributions("outgoing")]);
      pendingProposals = incoming.filter((c) => c.status === "pending").length;
    } catch (err) {
      proposalsFailed = true;
      sharingError = failText(err, "exercises.contributions.loadFailed");
    } finally {
      proposalsLoading = false;
    }
  }

  function openProposalsFor(group: ExerciseGroup) {
    switchView("proposals", group.groupId, group.name);
  }

  /** Shows an own exercise group: own view, filters cleared (they could hide it), expanded, scrolled to. */
  async function openGroupInLibrary(groupId: string) {
    switchView("own");
    searchQuery = "";
    selectedTopic = "ALL";
    selectedGrade = "ALL";
    selectedSubject = "ALL";
    expandedGroups.open(groupId);
    await tick();
    document.getElementById(`exercise-group-${groupId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** Favorite/archive (issue #252): moved at once, then saved per group; a failure reloads the true state. */
  async function setGroupFlags(groups: ExerciseGroup[], flags: GroupFlags) {
    flagError = "";
    exercises = withGroupFlags(exercises, groups, flags);
    try {
      for (const group of groups) await saveGroupFlags(group, flags); // NOSONAR: one PATCH per group
    } catch {
      flagError = translate("common.listSections.flagFailed");
      await loadExercises();
    }
  }
  let allSelectedFavorite = $derived(selectedGroups.length > 0 && selectedGroups.every((g) => groupFlags(g).favorite));
  let allSelectedArchived = $derived(selectedGroups.length > 0 && selectedGroups.every((g) => groupFlags(g).archived));

  async function loadShared() {
    sharedLoading = true;
    sharedError = "";
    try {
      sharedRows = await listSharedExercises();
    } catch (err) {
      sharedError = failText(err, "exercises.sharing.loadFailed");
    } finally {
      sharedLoading = false;
    }
  }

  /** Changing the tab by hand drops a focus set from a card's proposal tag. */
  function switchView(next: string, focusGroupId = "", focusName = "") {
    proposalFocusGroupId = focusGroupId;
    proposalFocusName = focusName;
    sharingError = "";
    view = next === "shared" || next === "proposals" ? next : "own";
    loadActiveView();
  }

  function loadActiveView() {
    if (activeView === "shared") loadShared();
    else if (activeView === "proposals") loadProposals();
  }

  /** Opens the editor for a new exercise (no record), an existing one, or a new version of `ex`. */
  function openEditor(ex: ExerciseRecord | null = null, asNewVersion = false) {
    editingExercise = asNewVersion ? null : ex;
    isCreatingVersion = asNewVersion;
    versionBaseEx = asNewVersion ? ex : null;
    isEditorOpen = true;
  }


  $effect.pre(() => {
    const groups = allGroups;
    const expanded = $expandedGroups;
    untrack(() => {
      for (const g of groups) {
        if (expanded[g.groupId]) for (const vKey of g.variants.keys()) usage.ensure(usageKey(g.groupId, vKey));
      }
    });
  });

  $effect.pre(() => {
    const key = sortKey;
    untrack(() => saveSort(SORT_STORAGE.exercises, key));
  });

  // The share question after saving (issue #263) shared a group: reload for its badge. Skips the first run.
  let seenShares = get(sharedFromQuestion);
  $effect.pre(() => {
    const shares = $sharedFromQuestion;
    untrack(() => {
      if (shares === seenShares) return;
      seenShares = shares;
      void loadExercises();
    });
  });

  // A filter change, another view or a deleted group drops it from the selection, so an action never hits a hidden group.
  $effect.pre(() => {
    const ids = activeView === "own" ? filteredGroups.map((g) => g.groupId) : [];
    untrack(() => selection.prune(ids));
  });
</script>

<PageShell width="fluid">
  <PageHeader
    title={$t("exercises.page.title")}
    subtitle={$t("exercises.page.subtitle")}
    helpTopic="exercises"
  >
    {#snippet actions()}
      {#if sharingAvailable}
        <Menu label={$t("exercises.sharing.menu")} icon={faShareNodes} showLabel labelClass="hidden sm:inline" align="end">
          {#snippet children({ close })}
            <MenuItem icon={faShareNodes} onSelect={() => { sharingFlow?.bulk("bulkShare"); close(); }}>{$t("exercises.sharing.bulk.shareAll")}</MenuItem>
            <MenuItem icon={faEyeSlash} onSelect={() => { sharingFlow?.bulk("bulkUnshare"); close(); }}>{$t("exercises.sharing.bulk.unshareAll")}</MenuItem>
            <MenuItem icon={sharingPaused ? faPlay : faPause} onSelect={() => { close(); sharingFlow?.togglePause(); }}>
              {sharingPaused ? $t("exercises.sharing.pause.resume") : $t("exercises.sharing.pause.pause")}
            </MenuItem>
          {/snippet}
        </Menu>
      {/if}
      {#if activeView === "own"}
        <Button variant="outlined" severity="secondary" icon={faFileImport} disabled={isImporting} onClick={() => importInput?.click()}
        >{$t("exercises.page.importButton")}</Button>
        <input bind:this={importInput} type="file" accept={IMPORT_ACCEPT} onchange={handleImportFile} hidden />
      {/if}
      {#if activeView === "own" && allGroups.length > 0}
        <Button variant="outlined" severity="secondary" icon={faFileZipper} onClick={() => (exportTarget = { groups: allGroups, library: true })}
        >{$t("exercises.page.exportLibraryButton")}</Button>
      {/if}
      <Button icon={faPlus} onClick={() => openEditor()}>{$t("exercises.page.createButton")}</Button>
    {/snippet}
  </PageHeader>

  {#if isLocalFallback}
    <Alert severity="danger" class="mb-6">{$t("exercises.page.localFallback")}</Alert>
  {/if}
  {#if errorMsg}
    <Alert severity="danger" class="mb-6">{errorMsg}</Alert>
  {/if}
  {#if sharingNotice}
    <Alert severity="success" class="mb-6" onDismiss={() => (sharingNotice = "")}>{sharingNotice}</Alert>
  {/if}
  {#if flagError}
    <Alert severity="danger" class="mb-6" onDismiss={() => (flagError = "")}>{flagError}</Alert>
  {/if}
  {#if sharingError}
    <Alert severity="danger" class="mb-6" onDismiss={() => (sharingError = "")}>{sharingError}</Alert>
  {/if}
  {#if sharingEnabled && sharingPaused}
    <Alert severity="warning" class="mb-6">
      {$t("exercises.sharing.pause.banner")}
      {#snippet actions()}
        <Button size="sm" variant="outlined" severity="secondary" icon={faPlay} loading={isPauseBusy} onClick={() => sharingFlow?.togglePause()}>{$t("exercises.sharing.pause.resume")}</Button>
      {/snippet}
    </Alert>
  {/if}
  {#if sharingAvailable}
    <Tabs
      class="mb-4"
      label={$t("exercises.sharing.tabsLabel")}
      value={activeView}
      onChange={switchView}
      items={[
        { id: "own", label: $t("exercises.sharing.tabOwn"), icon: faBook },
        { id: "shared", label: $t("exercises.sharing.tabShared"), icon: faShareNodes },
        { id: "proposals", label: $t("exercises.contributions.tab"), icon: faCodePullRequest, count: pendingProposals || undefined },
      ]}
    />
  {/if}
  {#if activeView === "shared" && sharedError}
    <Alert severity="danger" class="mb-6">{sharedError}</Alert>
  {/if}

  <!-- Below `lg` the filter panel moves into a drawer; see FilterDrawer. -->
  <FilterLayout
    title={$t("exercises.page.filtersTitle")}
    toggleLabel={$t("exercises.page.showFilters")}
    activeCount={activeFilterCount}
    busy={isLoading}
  >
    {#snippet filters({ close })}
      <ListFilterPanel
        bind:searchQuery
        bind:selectedGrade
        bind:selectedSubject
        searchPlaceholder={$t("exercises.filterSidebar.searchPlaceholder")}
        gradeOptions={availableGrades}
        subjectOptions={availableSubjects}
        pillOptions={topicPillOptions}
        pillSelected={selectedTopic}
        pillAllLabel={$t("exercises.filterSidebar.allTopics", { count: groupsBeforeTopic.length })}
        {sortOptions}
        bind:sortKey
        onPillSelect={(topic) => {
          selectedTopic = topic;
          close();
        }}
      />
    {/snippet}

  {#if activeView === "proposals"}
    <ContributionList
      {incoming}
      {outgoing}
      isLoading={proposalsLoading && incoming.length === 0 && outgoing.length === 0}
      error={proposalsFailed}
      busyId={withdrawingId}
      onReview={(item) => contributionFlow?.review(item)}
      onWithdraw={(item) => contributionFlow?.withdraw(item)}
      onOpenGroup={openGroupInLibrary}
      focusGroupId={proposalFocusGroupId}
      focusName={proposalFocusName}
      onClearFocus={() => switchView("proposals")}
    />
  {:else if activeView === "shared"}
    <ExerciseGroupList
      mode="shared"
      isLoading={sharedLoading && sharedRows.length === 0}
      error={!!sharedError}
      {filteredGroups}
      expandedGroups={$expandedGroups}
      onToggleGroup={expandedGroups.toggle}
      onPreview={exercisePreview.open}
      {sharedBy}
      onCopy={(group) => sharingFlow?.copy(group)}
      {copyingGroupId}
    />
  {:else}
    <div class="flex min-w-0 flex-col gap-4">
    {#if filteredGroups.length > 0}
      <SelectionToolbar
        count={selectedGroups.length}
        total={filteredGroups.length}
        countText={$t("exercises.bulk.selection", { count: selectedGroups.length })}
        selectAllLabel={$t("common.bulk.selectAll")}
        onSelectAll={(on) => (on ? selection.set(filteredGroups.map((g) => g.groupId)) : selection.clear())}
        reason={sharingAvailable ? "" : $t("exercises.bulk.noSharing")}
      >
        {#snippet actions()}
          <Button size="sm" variant="outlined" icon={actionIcons.edit} disabled={!selectedGroups.length} onClick={() => bulkFlow?.open("edit", selectedGroups)}>{$t("common.edit")}</Button>
          <Button size="sm" variant="outlined" icon={actionIcons.export} disabled={!selectedGroups.length} onClick={() => (exportTarget = { groups: selectedGroups, library: false })}>{$t("exercises.bulk.exportAction")}</Button>
          <Button size="sm" variant="outlined" icon={actionIcons.favorite} disabled={!selectedGroups.length} onClick={() => setGroupFlags(selectedGroups, { isFavorite: !allSelectedFavorite })}>
            {allSelectedFavorite ? $t("common.listSections.unfavoriteSelected") : $t("common.listSections.favoriteSelected")}
          </Button>
          <Button size="sm" variant="outlined" icon={allSelectedArchived ? actionIcons.unarchive : actionIcons.archive} disabled={!selectedGroups.length} onClick={() => setGroupFlags(selectedGroups, { archived: !allSelectedArchived })}>
            {allSelectedArchived ? $t("common.listSections.unarchiveSelected") : $t("common.listSections.archiveSelected")}
          </Button>
          <Button size="sm" variant="outlined" icon={faShareNodes} disabled={!selectedGroups.length || !sharingAvailable} onClick={() => bulkFlow?.open("share", selectedGroups)}>{$t("exercises.bulk.share")}</Button>
          <Button size="sm" variant="outlined" icon={faEyeSlash} disabled={!selectedGroups.length || !sharingAvailable} onClick={() => bulkFlow?.open("unshare", selectedGroups)}>{$t("exercises.bulk.unshare")}</Button>
          <Button size="sm" variant="outlined" severity="danger" icon={actionIcons.delete} disabled={!selectedGroups.length} onClick={() => bulkFlow?.open("delete", selectedGroups)}>{$t("common.delete")}</Button>
        {/snippet}
      </SelectionToolbar>
    {/if}
    <ExerciseGroupList
      isLoading={isLoading && exercises.length === 0}
      isSelected={(id) => selection.has(id)}
      onSelect={(id, on) => selection.toggle(id, on)}
      {filteredGroups}
      expandedGroups={$expandedGroups}
      onToggleGroup={expandedGroups.toggle}
      onEditGroup={(group) => groupEditFlow?.open(group)}
      onEditExercise={(ex) => openEditor(ex)}
      onNewVersion={(ex) => openEditor(ex, true)}
      onDiff={(ex) => diffFlow?.open(ex)}
      onRegroup={(ex) => regroupFlow?.open(ex)}
      onDelete={(ex) => deleteFlow?.open(ex)}
      onPreview={exercisePreview.open}
      usageMap={$usage}
      onOpenVariant={(ex) => variantFlow?.open(ex)}
      onOpenExam={(examId) => (summaryExamId = examId)}
      onCreateFirst={() => openEditor()}
      {sharingEnabled}
      {syncStatus}
      onShare={(group) => sharingFlow?.share(group)}
      onResync={(group) => sharingFlow?.resync(group)}
      onUnlink={(group) => sharingFlow?.unlink(group)}
      onContribute={(group) => contributionFlow?.contribute(group)}
      {pendingByGroup}
      onOpenProposals={openProposalsFor}
      onExport={(group) => (exportTarget = { groups: [group], library: false })}
      onDuplicate={(group, rep) => sharingFlow?.duplicate(group, rep)}
      {duplicatingGroupId}
      onFavorite={(group, on) => setGroupFlags([group], { isFavorite: on })}
      onArchive={(group, on) => setGroupFlags([group], { archived: on })}
    />
    </div>
  {/if}
  </FilterLayout>
</PageShell>

<PreviewHost flow={exercisePreview} kind="exercise" />

{#if exportTarget}
  <ExerciseExportModal groups={exportTarget.groups} library={exportTarget.library} onClose={() => (exportTarget = null)} />
{/if}

<SharingFlow
  bind:this={sharingFlow}
  bind:copyingGroupId
  bind:duplicatingGroupId
  bind:pauseBusy={isPauseBusy}
  onNotice={(message) => (sharingNotice = message)}
  onError={(message) => (sharingError = message)}
  onSaved={loadExercises}
/>

<ContributionFlow
  bind:this={contributionFlow}
  bind:withdrawingId
  onNotice={(message) => (sharingNotice = message)}
  onError={(message) => (sharingError = message)}
  onAccepted={() => Promise.all([loadProposals(), loadExercises()]).then(() => {})}
  onDecided={() => Promise.all([loadProposals(), refreshSyncStatus()]).then(() => {})}
  onSubmitted={refreshSyncStatus}
/>

<VariantFlow bind:this={variantFlow} onSaved={loadExercises} />

<ExerciseEditorModal
  isOpen={isEditorOpen}
  editingExercise={editingExercise}
  isCreatingVersion={isCreatingVersion}
  versionBaseEx={versionBaseEx}
  onClose={() => (isEditorOpen = false)}
  onSave={loadExercises}
/>

<GroupEditFlow bind:this={groupEditFlow} onSaved={loadExercises} />
<BulkGroupFlow
  bind:this={bulkFlow}
  onSaved={async () => {
    selection.clear();
    await loadExercises();
  }}
  onNotice={(message) => (sharingNotice = message)}
/>

<RegroupFlow bind:this={regroupFlow} groups={allGroups} onSaved={loadExercises} />

<ExerciseDeleteFlow bind:this={deleteFlow} onSaved={loadExercises} />

<DiffFlow bind:this={diffFlow} {exercises} onSaved={loadExercises} />

{#if summaryExamId}
  <ExamSummaryModal examId={summaryExamId} onClose={() => (summaryExamId = null)} />
{/if}
