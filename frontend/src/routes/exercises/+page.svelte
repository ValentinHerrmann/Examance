<script lang="ts">
  import { type ExerciseGroup, getGroupRepresentative, groupExercises, groupIsShared } from "#lib/exercise-library/groupExercises";
  import { onMount, tick, untrack } from "svelte";
  import { db } from "#lib/db/db";
  import { sessionStore, awaitSessionReady } from "#lib/stores/session";
  import { capabilitiesStore, effectiveLatexStore, featuresStore, markSharingPaused } from "#lib/stores/capabilities";
  import { page } from "$app/state";
  import type { ExerciseRecord } from "#lib/db/schema";
  import { loadExercisesEncrypted, encryptExercise } from "#lib/db/dbEncryption";
  import { api, ApiError, apiErrorMessage } from "#lib/api/client";
  import { get } from "svelte/store";
  import { isServerBacked } from "#lib/utils/serverBacked";
  import { countActiveFilters, facetOptions, matchesExerciseFilters, uniqueSorted } from "#lib/utils/listFilter";
  import { GROUP_SORT_KEYS, SORT_STORAGE, loadSort, saveSort, sortGroups } from "#lib/utils/listSort";
  import { t, translate, type TranslationKey } from "#lib/i18n";

  import ExerciseEditorModal from "#lib/components/ExerciseEditorModal.svelte";
  import ListFilterPanel from "#lib/components/common/ListFilterPanel.svelte";
  import { Alert, Button, ConfirmDialog, FilterLayout, Menu, MenuItem, PageHeader, PageShell, Tabs } from "#lib/components/ui";
  import PreviewHost from "#lib/components/common/PreviewHost.svelte";
  import { createPreviewFlow } from "#lib/stores/previewFlow";
  import { loadExamUsage, usageKey, type ExamUsageEntry } from "#lib/exercise-library/examUsage";
  import { createExpandSet } from "#lib/utils/expandSet";
  import { createLazyMap } from "#lib/utils/lazyMap";
  import { exerciseRepository, mapApiToExerciseRecord } from "#lib/repositories/exerciseRepository";
  import { compileExercisePreview } from "#lib/latex/exercisePreview";
  import { exerciseReportFiles } from "#lib/layout-report/collect";
  import { faBook, faCodePullRequest, faPause, faPlay, faPlus, faShareNodes, faEyeSlash, faFileZipper, faFileImport } from "@fortawesome/free-solid-svg-icons";
  import { importArchiveInteractively } from "#lib/services/archiveService";
  import { IMPORT_ACCEPT } from "#lib/archive/format";
  import ExerciseGroupList from "#lib/components/exercise-library/ExerciseGroupList.svelte";
  import ExamSummaryModal from "#lib/components/exam/ExamSummaryModal.svelte";
  import ExerciseExportModal from "#lib/components/exercise-library/ExerciseExportModal.svelte";
  import GroupEditFlow from "#lib/components/exercise-library/GroupEditFlow.svelte";
  import RegroupFlow from "#lib/components/exercise-library/RegroupFlow.svelte";
  import DeleteWithUsageModal from "#lib/components/common/DeleteWithUsageModal.svelte";
  import VariantFlow from "#lib/components/exercise-library/VariantFlow.svelte";
  import DiffFlow from "#lib/components/exercise-library/DiffFlow.svelte";
  import ShareExerciseModal from "#lib/components/exercise-library/ShareExerciseModal.svelte";
  import ResyncModal from "#lib/components/exercise-library/ResyncModal.svelte";
  import ContributeModal from "#lib/components/exercise-library/ContributeModal.svelte";
  import ReviewContributionModal from "#lib/components/exercise-library/ReviewContributionModal.svelte";
  import ContributionList from "#lib/components/exercise-library/ContributionList.svelte";
  import {
    acceptContribution,
    listContributions,
    loadContribution,
    loadContributionSummary,
    rejectContribution,
    submitContributions,
    withdrawContribution,
    type ContributionDetail,
    type ContributionSummary,
    type PendingForGroup,
  } from "#lib/api/exerciseContributions";
  import {
    applyResync,
    bulkSetSharing,
    copySharedExercise,
    listSharedExercises,
    loadResyncPreview,
    loadSyncStatus,
    setExerciseSharing,
    setSharingPaused,
    unlinkSource,
    type ResyncPreview,
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
  let shareGroup: ExerciseGroup | null = $state.raw(null);
  let isSharing = $state(false);
  let shareError = $state("");
  let isResyncOpen = $state(false);
  let resyncGroupId = $state("");
  let resyncPreview: ResyncPreview | null = $state.raw(null);
  let isResyncing = $state(false);
  let resyncError = $state("");
  let unlinkGroup: ExerciseGroup | null = $state.raw(null);
  let isUnlinking = $state(false);
  let sharingPaused = $derived($capabilitiesStore?.sharingPaused === true);
  let bulkMode: "bulkShare" | "bulkUnshare" | null = $state(null);
  let isBulkBusy = $state(false);
  let bulkError = $state("");
  let isPauseBusy = $state(false);
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
  let reviewId = $state("");
  let reviewDetail: ContributionDetail | null = $state.raw(null);
  let isReviewBusy = $state(false);
  let reviewError = $state("");
  /** Set after a 409 on accept: the reloaded detail keeps the author's hand-merged text. */
  let reviewKeepEdits = $state(false);
  let contributeGroupId = $state("");
  let contributePreview: ResyncPreview | null = $state.raw(null);
  let isContributeBusy = $state(false);
  let contributeError = $state("");
  let selectedTopic: string = $state("ALL");
  let selectedGrade: string = $state("ALL");
  let selectedSubject: string = $state("ALL");
  let searchQuery: string = $state("");
  let sortKey: string = $state(loadSort(SORT_STORAGE.exercises, GROUP_SORT_KEYS, "nameAsc"));

  // Badge on the mobile filter button, so an active filter is visible without
  // opening the drawer.
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
  let isDeleteModalOpen = $state(false);
  let deletingExercise: ExerciseRecord | null = $state.raw(null);
  let deleteExams: ExamUsageEntry[] = $state.raw([]);
  let isDeleteLoading = $state(false);
  let isDeleting = $state(false);
  let deleteError = $state("");

  // Group metadata, regroup, diff and variant dialogs: each flow owns its state and opens via `open(...)`.
  let groupEditFlow: ReturnType<typeof GroupEditFlow> | undefined = $state();
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

  const exercisePreview = createPreviewFlow<ExerciseRecord>({
    kind: "exercise",
    idOf: (ex) => ex.id!,
    titleOf: (ex) => ex.name || translate("exercises.untitled"),
    compile: (ex, onStatus, onAngabe) =>
      compileExercisePreview({
        cacheId: ex.id!,
        name: ex.name ?? "",
        latexBody: ex.latexBody ?? "",
        resourceOwnerId: ex.id!,
        staged: false,
        useLocal: $effectiveLatexStore === "local",
        key: get(sessionStore).sessionKey,
        onStatus,
        onAngabe,
      }),
    reportFiles: (ex, angabeUrl, loesungUrl) =>
      exerciseReportFiles(
        {
          name: ex.name ?? "",
          latexBody: ex.latexBody ?? "",
          resourceOwnerId: ex.id!,
          staged: false,
          key: get(sessionStore).sessionKey,
        },
        angabeUrl,
        loesungUrl
      ),
  });

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
    const key = get(sessionStore).sessionKey;
    try {
      if (isServerBacked()) {
        try {
          const remoteExs = (await api.get("/exercises", { silentError: true })) as any[];
          // Exercises whose code was withheld (results-only imports) belong to their exam, not the library.
          exercises = remoteExs.map(mapApiToExerciseRecord).filter((ex) => !ex.codeWithheld);
          const encryptedExs = await Promise.all(exercises.map(ex => encryptExercise(ex, key)));
          await db.exercises.bulkPut(encryptedExs);
          isLocalFallback = false;
        } catch (apiErr) {
          console.warn(
            "Failed to fetch remote exercises, falling back to IDB:",
            apiErr,
          );
          exercises = (await loadExercisesEncrypted(key)).filter((ex) => !ex.codeWithheld);
          isLocalFallback = true;
        }
      } else {
        isLocalFallback = false;
        exercises = (await loadExercisesEncrypted(key)).filter((ex) => !ex.codeWithheld);
      }
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

  function openReview(item: ContributionSummary) {
    reviewId = item.id;
    reviewDetail = null;
    reviewKeepEdits = false;
    fetchReviewDetail(item.id);
  }

  /** Applies the answer only while `id` is still the open review (a late one must not land on another). */
  async function fetchReviewDetail(id: string) {
    reviewError = "";
    try {
      const detail = await loadContribution(id);
      if (reviewId === id) reviewDetail = detail;
    } catch (err) {
      if (reviewId === id) reviewError = failText(err, "exercises.contributions.loadFailed");
    }
  }

  function closeReview() {
    reviewId = "";
    reviewDetail = null;
  }

  async function handleAcceptProposal(id: string, opts: { latexBody?: string; asVariant: boolean; variantKey?: string }) {
    isReviewBusy = true;
    reviewError = "";
    try {
      await acceptContribution(id, opts);
      if (reviewId === id) closeReview();
      sharingNotice = translate("exercises.contributions.accepted");
      await Promise.all([loadProposals(), loadExercises()]);
    } catch (err) {
      if (reviewId !== id) return;
      reviewError = failText(err, "exercises.contributions.decideFailed");
      if (err instanceof ApiError && err.status === 409) {
        const fresh = await loadContribution(id).catch(() => null);
        if (fresh && reviewId === id) {
          reviewKeepEdits = true;
          reviewDetail = fresh;
        }
      }
    } finally {
      isReviewBusy = false;
    }
  }

  async function handleRejectProposal(id: string, note: string) {
    isReviewBusy = true;
    reviewError = "";
    try {
      await rejectContribution(id, note);
      if (reviewId === id) closeReview();
      await Promise.all([loadProposals(), refreshSyncStatus()]);
    } catch (err) {
      if (reviewId === id) reviewError = failText(err, "exercises.contributions.decideFailed");
    } finally {
      isReviewBusy = false;
    }
  }

  async function handleWithdraw(item: ContributionSummary) {
    withdrawingId = item.id;
    sharingError = "";
    try {
      await withdrawContribution(item.id);
      await Promise.all([loadProposals(), refreshSyncStatus()]);
    } catch (err) {
      sharingError = failText(err, "exercises.contributions.decideFailed");
    } finally {
      withdrawingId = "";
    }
  }

  function openContribute(group: ExerciseGroup) {
    contributeGroupId = group.groupId;
    contributePreview = null;
    fetchContributePreview(group.groupId);
  }

  async function fetchContributePreview(groupId: string) {
    contributeError = "";
    try {
      const preview = await loadResyncPreview(groupId);
      if (contributeGroupId === groupId) contributePreview = preview;
    } catch (err) {
      if (contributeGroupId === groupId) contributeError = failText(err, "exercises.contributions.loadFailed");
    }
  }

  async function handleSubmitContribution(exerciseIds: string[], message: string) {
    const groupId = contributeGroupId;
    if (!groupId) return;
    isContributeBusy = true;
    contributeError = "";
    try {
      await submitContributions(groupId, exerciseIds, message);
      if (contributeGroupId === groupId) contributeGroupId = "";
      sharingNotice = translate("exercises.contributions.submitted");
      await refreshSyncStatus();
    } catch (err) {
      if (contributeGroupId === groupId) contributeError = failText(err, "exercises.contributions.submitFailed");
    } finally {
      isContributeBusy = false;
    }
  }

  async function handleBulkConfirm() {
    if (!bulkMode) return;
    isBulkBusy = true;
    bulkError = "";
    try {
      const res = await bulkSetSharing(bulkMode === "bulkShare");
      sharingNotice =
        bulkMode === "bulkShare"
          ? translate("exercises.sharing.bulk.sharedDone", { groups: res.groups, skipped: res.skippedCopies })
          : translate("exercises.sharing.bulk.unsharedDone", { groups: res.groups });
      bulkMode = null;
      await loadExercises();
    } catch (err) {
      bulkError = failText(err, "exercises.sharing.shareModal.failed");
    } finally {
      isBulkBusy = false;
    }
  }

  /** Pause hides everything shared without forgetting the per-group choices. */
  async function togglePause() {
    isPauseBusy = true;
    sharingError = "";
    try {
      await setSharingPaused(!sharingPaused);
      markSharingPaused(!sharingPaused);
    } catch (err) {
      sharingError = failText(err, "exercises.sharing.pause.failed");
    } finally {
      isPauseBusy = false;
    }
  }

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

  function openShareModal(group: ExerciseGroup) {
    shareError = "";
    shareGroup = group;
  }

  async function handleShareConfirm() {
    if (!shareGroup) return;
    const group = shareGroup;
    isSharing = true;
    shareError = "";
    try {
      await setExerciseSharing(getGroupRepresentative(group).id, !groupIsShared(group));
      shareGroup = null;
      await loadExercises();
    } catch (err) {
      shareError = failText(err, "exercises.sharing.shareModal.failed");
    } finally {
      isSharing = false;
    }
  }

  async function handleCopy(group: ExerciseGroup) {
    copyingGroupId = group.groupId;
    sharingNotice = "";
    sharingError = "";
    try {
      await copySharedExercise(getGroupRepresentative(group).id);
      sharingNotice = translate("exercises.sharing.copied", { name: group.name });
      await loadExercises();
    } catch (err) {
      sharingError = failText(err, "exercises.sharing.copyFailed");
    } finally {
      copyingGroupId = "";
    }
  }

  /** Own group copied as a new private group to start a similar exercise from (issue #121). */
  async function handleDuplicate(group: ExerciseGroup, rep: ExerciseRecord) {
    duplicatingGroupId = group.groupId;
    sharingNotice = "";
    sharingError = "";
    try {
      await exerciseRepository.duplicate(rep.id);
      sharingNotice = translate("exercises.groupList.duplicated", { name: group.name });
      await loadExercises();
    } catch (err) {
      sharingError = failText(err, "exercises.groupList.duplicateFailed");
    } finally {
      duplicatingGroupId = "";
    }
  }

  /** Keeps the shown preview until the new one is in; a late answer for another group is dropped. */
  async function fetchResyncPreview(groupId: string) {
    try {
      const preview = await loadResyncPreview(groupId);
      if (resyncGroupId === groupId) resyncPreview = preview;
    } catch (err) {
      if (resyncGroupId === groupId) resyncError = failText(err, "exercises.sharing.resyncModal.failed");
    }
  }

  function openResync(group: ExerciseGroup) {
    resyncGroupId = group.groupId;
    resyncPreview = null;
    resyncError = "";
    isResyncOpen = true;
    fetchResyncPreview(group.groupId);
  }

  function closeResync() {
    isResyncOpen = false;
    resyncGroupId = "";
  }

  /** Applies the chosen, reviewed variants; the server refuses (409) if one moved on meanwhile. */
  async function handleApplyResync(selected: Set<string>, overrides: Record<string, string>) {
    const preview = resyncPreview;
    if (!preview) return;
    const groupId = preview.groupId;
    isResyncing = true;
    resyncError = "";
    try {
      await applyResync(preview, selected, overrides);
      if (resyncGroupId === groupId) closeResync();
      sharingNotice = translate("exercises.sharing.resyncModal.applied");
      await loadExercises();
    } catch (err) {
      if (resyncGroupId !== groupId) return;
      resyncError = failText(err, "exercises.sharing.resyncModal.failed");
      if (err instanceof ApiError && err.code === "ERR_SHARE_SOURCE_CHANGED") await fetchResyncPreview(groupId);
    } finally {
      isResyncing = false;
    }
  }

  async function handleUnlinkConfirm() {
    if (!unlinkGroup) return;
    isUnlinking = true;
    sharingError = "";
    try {
      await unlinkSource(unlinkGroup.groupId);
      unlinkGroup = null;
      await loadExercises();
    } catch (err) {
      unlinkGroup = null;
      sharingError = failText(err, "exercises.sharing.unlinkFailed");
    } finally {
      isUnlinking = false;
    }
  }

  function openCreateModal() {
    editingExercise = null;
    isCreatingVersion = false;
    versionBaseEx = null;
    isEditorOpen = true;
  }

  function openEditModal(ex: ExerciseRecord) {
    editingExercise = ex;
    isCreatingVersion = false;
    versionBaseEx = null;
    isEditorOpen = true;
  }

  function openNewVersionModal(ex: ExerciseRecord) {
    editingExercise = null;
    isCreatingVersion = true;
    versionBaseEx = ex;
    isEditorOpen = true;
  }

  function handleExerciseSaved(detail: { sharingError: string | null }) {
    if (detail.sharingError) sharingError = translate("exercises.sharing.editorShareFailed", { message: detail.sharingError });
    loadExercises();
  }

  async function openDeleteModal(ex: ExerciseRecord) {
    deletingExercise = ex;
    deleteExams = [];
    deleteError = "";
    isDeleteLoading = true;
    isDeleteModalOpen = true;
    try {
      deleteExams = await loadExamUsage([ex.id!]);
    } catch (err) {
      console.warn("Failed to check exercise usage:", err);
    } finally {
      isDeleteLoading = false;
    }
  }

  async function handleConfirmDelete() {
    if (!deletingExercise) return;
    isDeleting = true;
    deleteError = "";
    try {
      await exerciseRepository.delete(deletingExercise.id!);
      isDeleteModalOpen = false;
      deletingExercise = null;
      await loadExercises();
    } catch (err: any) {
      deleteError = translate("exercises.page.deleteFailed", { message: err.message });
    } finally {
      isDeleting = false;
    }
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
            <MenuItem icon={faShareNodes} onSelect={() => { bulkError = ""; bulkMode = "bulkShare"; close(); }}>{$t("exercises.sharing.bulk.shareAll")}</MenuItem>
            <MenuItem icon={faEyeSlash} onSelect={() => { bulkError = ""; bulkMode = "bulkUnshare"; close(); }}>{$t("exercises.sharing.bulk.unshareAll")}</MenuItem>
            <MenuItem icon={sharingPaused ? faPlay : faPause} onSelect={() => { close(); togglePause(); }}>
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
      <Button icon={faPlus} onClick={openCreateModal}>{$t("exercises.page.createButton")}</Button>
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
  {#if sharingError}
    <Alert severity="danger" class="mb-6" onDismiss={() => (sharingError = "")}>{sharingError}</Alert>
  {/if}
  {#if sharingEnabled && sharingPaused}
    <Alert severity="warning" class="mb-6">
      {$t("exercises.sharing.pause.banner")}
      {#snippet actions()}
        <Button size="sm" variant="outlined" severity="secondary" icon={faPlay} loading={isPauseBusy} onClick={togglePause}>{$t("exercises.sharing.pause.resume")}</Button>
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
      onReview={openReview}
      onWithdraw={handleWithdraw}
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
      onCopy={handleCopy}
      {copyingGroupId}
    />
  {:else}
    <ExerciseGroupList
      isLoading={isLoading && exercises.length === 0}
      {filteredGroups}
      expandedGroups={$expandedGroups}
      onToggleGroup={expandedGroups.toggle}
      onEditGroup={(group) => groupEditFlow?.open(group)}
      onEditExercise={openEditModal}
      onNewVersion={openNewVersionModal}
      onDiff={(ex) => diffFlow?.open(ex)}
      onRegroup={(ex) => regroupFlow?.open(ex)}
      onDelete={openDeleteModal}
      onPreview={exercisePreview.open}
      usageMap={$usage}
      onOpenVariant={(ex) => variantFlow?.open(ex)}
      onOpenExam={(examId) => (summaryExamId = examId)}
      onCreateFirst={openCreateModal}
      {sharingEnabled}
      {syncStatus}
      onShare={openShareModal}
      onResync={openResync}
      onUnlink={(group) => (unlinkGroup = group)}
      onContribute={openContribute}
      {pendingByGroup}
      onOpenProposals={openProposalsFor}
      onExport={(group) => (exportTarget = { groups: [group], library: false })}
      onDuplicate={handleDuplicate}
      {duplicatingGroupId}
    />
  {/if}
  </FilterLayout>
</PageShell>

<PreviewHost flow={exercisePreview} kind="exercise" />

{#if exportTarget}
  <ExerciseExportModal groups={exportTarget.groups} library={exportTarget.library} onClose={() => (exportTarget = null)} />
{/if}

<ShareExerciseModal
  open={!!bulkMode}
  mode={bulkMode ?? "bulkShare"}
  email={$sessionStore.email ?? ""}
  busy={isBulkBusy}
  error={bulkError}
  onConfirm={handleBulkConfirm}
  onClose={() => (bulkMode = null)}
/>

<ContributeModal
  open={!!contributeGroupId}
  preview={contributePreview}
  email={$sessionStore.email ?? ""}
  busy={isContributeBusy}
  error={contributeError}
  onRetry={() => fetchContributePreview(contributeGroupId)}
  onSubmit={handleSubmitContribution}
  onClose={() => (contributeGroupId = "")}
/>

<ReviewContributionModal
  open={!!reviewId}
  detail={reviewDetail}
  busy={isReviewBusy}
  error={reviewError}
  keepEdits={reviewKeepEdits}
  onRetry={() => fetchReviewDetail(reviewId)}
  onAccept={handleAcceptProposal}
  onReject={handleRejectProposal}
  onClose={closeReview}
/>

<ShareExerciseModal
  open={!!shareGroup}
  shared={shareGroup ? groupIsShared(shareGroup) : false}
  email={$sessionStore.email ?? ""}
  name={shareGroup?.name ?? ""}
  busy={isSharing}
  error={shareError}
  onConfirm={handleShareConfirm}
  onClose={() => (shareGroup = null)}
/>

<ResyncModal
  open={isResyncOpen}
  preview={resyncPreview}
  busy={isResyncing}
  error={resyncError}
  onRetry={() => {
    resyncError = "";
    fetchResyncPreview(resyncGroupId);
  }}
  onApply={handleApplyResync}
  onClose={closeResync}
/>

<ConfirmDialog
  open={!!unlinkGroup}
  title={$t("exercises.sharing.unlinkTitle")}
  message={$t("exercises.sharing.unlinkBody")}
  confirmText={$t("exercises.sharing.unlink")}
  cancelText={$t("common.cancel")}
  busy={isUnlinking}
  onConfirm={handleUnlinkConfirm}
  onCancel={() => (unlinkGroup = null)}
/>

<VariantFlow bind:this={variantFlow} onSaved={loadExercises} />

<ExerciseEditorModal
  isOpen={isEditorOpen}
  editingExercise={editingExercise}
  isCreatingVersion={isCreatingVersion}
  versionBaseEx={versionBaseEx}
  canShare={sharingAvailable}
  onClose={() => (isEditorOpen = false)}
  onSave={handleExerciseSaved}
/>

<GroupEditFlow bind:this={groupEditFlow} onSaved={loadExercises} />

<RegroupFlow bind:this={regroupFlow} groups={allGroups} onSaved={loadExercises} />

<DeleteWithUsageModal
  open={isDeleteModalOpen && !!deletingExercise}
  title={deletingExercise ? $t("exercises.deleteModal.title", { name: deletingExercise.name || $t("exercises.untitled") }) : ""}
  usageLoading={isDeleteLoading}
  loadingText={$t("exercises.deleteModal.checkingUsage")}
  usageTitle={$t("exercises.deleteModal.warningTitle")}
  usageText={deleteExams.length > 0 ? $t("exercises.deleteModal.usageInfo", { count: deleteExams.length }) : ""}
  usageHint={$t("exercises.deleteModal.usageWarning")}
  items={deleteExams.map((e) => ({ id: e.id, title: e.title, meta: e.datum }))}
  plainText={$t("exercises.deleteModal.confirmPlain")}
  busy={isDeleting}
  error={deleteError}
  onConfirm={handleConfirmDelete}
  onClose={() => (isDeleteModalOpen = false)}
/>

<DiffFlow bind:this={diffFlow} {exercises} onSaved={loadExercises} />

{#if summaryExamId}
  <ExamSummaryModal examId={summaryExamId} onClose={() => (summaryExamId = null)} />
{/if}
