<script lang="ts">
  import { type ExerciseGroup, getGroupRepresentative, groupExercises } from "#lib/exercise-library/groupExercises";
  import { onMount, untrack } from "svelte";
  import { db } from "#lib/db/db";
  import { sessionStore, awaitSessionReady } from "#lib/stores/session";
  import { capabilitiesStore, effectiveLatexStore, featuresStore, markSharingPaused } from "#lib/stores/capabilities";
  import { page } from "$app/state";
  import type { ExerciseRecord } from "#lib/db/schema";
  import { loadExercisesEncrypted, saveExerciseEncrypted, encryptExercise } from "#lib/db/dbEncryption";
  import { api } from "#lib/api/client";
  import { parseExerciseScore } from "#lib/latex/scoreParser";
  import { get } from "svelte/store";
  import { isServerBacked } from "#lib/utils/serverBacked";
  import { countActiveFilters, matchesQuery, uniqueSorted } from "#lib/utils/listFilter";
  import { t, translate } from "#lib/i18n";

  import LatexEditor, { type DiffDecorationConfig, type DiffLineDecoration, type DiffLinePaddingDecoration, type DiffWordDecoration, type DiffGapDecoration } from "#lib/components/LatexEditor.svelte";
  import { highlightLatexToHtml } from "#lib/latex/highlighter";
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
  import { faBook, faCodePullRequest, faPause, faPlay, faPlus, faShareNodes, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
  import ExerciseGroupList from "#lib/components/exercise-library/ExerciseGroupList.svelte";
  import GroupEditModal from "#lib/components/exercise-library/GroupEditModal.svelte";
  import RegroupModal from "#lib/components/exercise-library/RegroupModal.svelte";
  import DeleteWithUsageModal from "#lib/components/common/DeleteWithUsageModal.svelte";
  import VariantModal from "#lib/components/exercise-library/VariantModal.svelte";
  import ExerciseDiffModal from "#lib/components/exercise-library/ExerciseDiffModal.svelte";
  import ShareExerciseModal from "#lib/components/exercise-library/ShareExerciseModal.svelte";
  import ResyncModal from "#lib/components/exercise-library/ResyncModal.svelte";
  import ContributeModal from "#lib/components/exercise-library/ContributeModal.svelte";
  import ReviewContributionModal from "#lib/components/exercise-library/ReviewContributionModal.svelte";
  import ContributionList from "#lib/components/exercise-library/ContributionList.svelte";
  import {
    acceptContribution,
    listContributions,
    loadContribution,
    pendingIncomingCount,
    rejectContribution,
    submitContributions,
    withdrawContribution,
    type ContributionDetail,
    type ContributionSummary,
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
  let pendingProposals = $state(0);
  let withdrawingId = $state("");
  let reviewId = $state("");
  let reviewDetail: ContributionDetail | null = $state.raw(null);
  let isReviewBusy = $state(false);
  let reviewError = $state("");
  let contributeGroupId = $state("");
  let contributePreview: ResyncPreview | null = $state.raw(null);
  let isContributeBusy = $state(false);
  let contributeError = $state("");
  let selectedTopic: string = $state("ALL");
  let selectedGrade: string = $state("ALL");
  let selectedSubject: string = $state("ALL");
  let searchQuery: string = $state("");

  // Badge on the mobile filter button, so an active filter is visible without
  // opening the drawer.
  let activeFilterCount = $derived(countActiveFilters(searchQuery, selectedTopic, selectedGrade, selectedSubject));
  let isLoading = $state(false);
  /** Last failed/invalid action of an open modal, shown inline in it. */
  let modalError = $state("");
  let loadAgain = false;
  let errorMsg = $state("");
  let isLocalFallback = $state(false);

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

  // Regroup modal state
  let isRegroupModalOpen = $state(false);
  let regroupingExercise: ExerciseRecord | null = $state.raw(null);
  let regroupTargetGroupId: string = $state("");

  // Diff modal state
  let isDiffModalOpen = $state(false);
  let diffLeftId: string = $state("");
  let diffRightId: string = $state("");
  let diffGroupExercises: ExerciseRecord[] = $state.raw([]);
  let diffLeftLatex: string = $state("");
  let diffRightLatex: string = $state("");
  let isSavingDiffLeft = $state(false);
  let isSavingDiffRight = $state(false);
  let showDiffConfirmClose = $state(false);

  let lastLoadedLeftId = $state("");
  let lastLoadedRightId = $state("");

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
    compile: (ex, onStatus) =>
      compileExercisePreview({
        cacheId: ex.id!,
        name: ex.name ?? "",
        latexBody: ex.latexBody ?? "",
        resourceOwnerId: ex.id!,
        staged: false,
        useLocal: $effectiveLatexStore === "local",
        key: get(sessionStore).sessionKey,
        onStatus,
      }),
  });

  let activeDiffGroupExercises = $derived(diffGroupExercises.map(
    (e) => exercises.find((x) => x.id === e.id) || e
  ));

  function getDiffSelectLabel(ex: ExerciseRecord): string {
    const name = ex.name || translate("exercises.untitled");
    const v = ex.version || 1;
    const variantStr = ex.variantKey ? translate("exercises.page.diffSelectVariantSuffix", { key: ex.variantKey }) : "";
    return `${name} (v${v}${variantStr})`;
  }

  // Lazy: only look up exercises when the diff modal is open
  let diffLeftEx = $derived(isDiffModalOpen
    ? (exercises.find((e) => e.id === diffLeftId) || activeDiffGroupExercises.find((e) => e.id === diffLeftId))
    : null);
  let diffRightEx = $derived(isDiffModalOpen
    ? (exercises.find((e) => e.id === diffRightId) || activeDiffGroupExercises.find((e) => e.id === diffRightId))
    : null);

  let isDiffLeftDirty = $derived(diffLeftEx ? diffLeftLatex !== (diffLeftEx.latexBody || "") : false);
  let isDiffRightDirty = $derived(diffRightEx ? diffRightLatex !== (diffRightEx.latexBody || "") : false);

  let sharedExercises = $derived(sharedRows.map((r) => r.exercise));
  let sharedBy = $derived(new Map(sharedRows.map((r) => [r.exercise.exerciseGroupId ?? "", r.sharedByEmail])));
  /** The list the filters apply to: the own library or what others share. */
  let viewExercises = $derived(view === "shared" ? sharedExercises : exercises);

  let availableGrades = $derived(uniqueSorted(viewExercises, (e) => e.grade));
  let availableSubjects = $derived(uniqueSorted(viewExercises, (e) => e.subject));

  let filteredExercises = $derived(viewExercises.filter(
    (ex) =>
      (selectedTopic === "ALL" || ex.topicTag === selectedTopic) &&
      (selectedGrade === "ALL" || ex.grade === selectedGrade) &&
      (selectedSubject === "ALL" || ex.subject === selectedSubject) &&
      matchesQuery(searchQuery, ex.name, ex.topicTag, ex.grade, ex.subject, ex.latexBody)
  ));

  // Grouped view: filter then group
  let allGroups = $derived(groupExercises(exercises));
  let viewGroups = $derived(view === "shared" ? groupExercises(sharedExercises) : allGroups);
  // Topic pills count groups, not exercise rows.
  let topicPillOptions = $derived(uniqueSorted(viewExercises, (e) => e.topicTag).map((topic) => ({
    value: topic,
    label: topic,
    count: viewGroups.filter((g) => g.topicTag === topic).length,
  })));
  let filteredGroups = $derived(groupExercises(filteredExercises));

  onMount(() => {
    const requested = page.url.searchParams.get("view");
    if (requested === "proposals" || requested === "shared") switchView(requested);
    loadExercises();
  });

  /** Overlapping calls coalesce into one more run, so a slow earlier fetch can't overwrite newer data. */
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
      errorMsg = err.message || translate("exercises.page.loadFailed");
    }
    usage.reset();
    expandedGroups.prune([...groupExercises(exercises), ...groupExercises(sharedExercises)].map((g) => g.groupId));
    await refreshSyncStatus();
  }

  /** Which own copies have changes at their shared source. Online only; a failure keeps the last answer. */
  async function refreshSyncStatus() {
    if (!sharingEnabled || !isServerBacked() || isLocalFallback) return;
    try {
      syncStatus = new Map((await loadSyncStatus()).map((s) => [s.groupId, s]));
      pendingProposals = await pendingIncomingCount();
    } catch {
      sharingError = translate("exercises.sharing.statusFailed");
    }
  }

  async function loadProposals() {
    proposalsLoading = true;
    sharingError = "";
    try {
      [incoming, outgoing] = await Promise.all([listContributions("incoming"), listContributions("outgoing")]);
      pendingProposals = incoming.filter((c) => c.status === "pending").length;
    } catch (err: any) {
      sharingError = err?.message || translate("exercises.contributions.loadFailed");
    } finally {
      proposalsLoading = false;
    }
  }

  async function openReview(item: ContributionSummary) {
    reviewId = item.id;
    reviewDetail = null;
    reviewError = "";
    try {
      reviewDetail = await loadContribution(item.id);
    } catch (err: any) {
      reviewError = err?.message || translate("exercises.contributions.loadFailed");
    }
  }

  function closeReview() {
    reviewId = "";
    reviewDetail = null;
  }

  async function handleAcceptProposal(opts: { latexBody?: string; asVariant: boolean; variantKey?: string }) {
    if (!reviewId) return;
    isReviewBusy = true;
    reviewError = "";
    try {
      await acceptContribution(reviewId, opts);
      closeReview();
      sharingNotice = translate("exercises.contributions.accepted");
      await Promise.all([loadProposals(), loadExercises()]);
    } catch (err: any) {
      reviewError = err?.message || translate("exercises.contributions.decideFailed");
      if (err?.status === 409) reviewDetail = await loadContribution(reviewId).catch(() => reviewDetail);
    } finally {
      isReviewBusy = false;
    }
  }

  async function handleRejectProposal(note: string) {
    if (!reviewId) return;
    isReviewBusy = true;
    reviewError = "";
    try {
      await rejectContribution(reviewId, note);
      closeReview();
      await loadProposals();
    } catch (err: any) {
      reviewError = err?.message || translate("exercises.contributions.decideFailed");
    } finally {
      isReviewBusy = false;
    }
  }

  async function handleWithdraw(item: ContributionSummary) {
    withdrawingId = item.id;
    sharingError = "";
    try {
      await withdrawContribution(item.id);
      await loadProposals();
    } catch (err: any) {
      sharingError = err?.message || translate("exercises.contributions.decideFailed");
    } finally {
      withdrawingId = "";
    }
  }

  async function openContribute(group: ExerciseGroup) {
    contributeGroupId = group.groupId;
    contributePreview = null;
    contributeError = "";
    try {
      contributePreview = await loadResyncPreview(group.groupId);
    } catch (err: any) {
      contributeError = err?.message || translate("exercises.contributions.submitFailed");
    }
  }

  async function handleSubmitContribution(exerciseIds: string[], message: string) {
    isContributeBusy = true;
    contributeError = "";
    try {
      await submitContributions(contributeGroupId, exerciseIds, message);
      contributeGroupId = "";
      sharingNotice = translate("exercises.contributions.submitted");
    } catch (err: any) {
      contributeError = err?.message || translate("exercises.contributions.submitFailed");
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
    } catch (err: any) {
      bulkError = err?.message || translate("exercises.sharing.shareModal.failed");
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
    } catch (err: any) {
      sharingError = err?.message || translate("exercises.sharing.pause.failed");
    } finally {
      isPauseBusy = false;
    }
  }

  async function loadShared() {
    sharedLoading = true;
    sharedError = "";
    try {
      sharedRows = await listSharedExercises();
    } catch (err: any) {
      sharedError = err?.message || translate("exercises.sharing.loadFailed");
    } finally {
      sharedLoading = false;
    }
  }

  function switchView(next: string) {
    view = next === "shared" || next === "proposals" ? next : "own";
    if (view === "shared") loadShared();
    if (view === "proposals") loadProposals();
  }

  function groupIsShared(group: ExerciseGroup): boolean {
    return group.allMembers.some((m) => m.ex.isShared);
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
    } catch (err: any) {
      shareError = err?.message || translate("exercises.sharing.shareModal.failed");
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
    } catch (err: any) {
      sharingError = err?.message || translate("exercises.sharing.copyFailed");
    } finally {
      copyingGroupId = "";
    }
  }

  async function fetchResyncPreview() {
    resyncPreview = null;
    try {
      resyncPreview = await loadResyncPreview(resyncGroupId);
    } catch (err: any) {
      resyncError = err?.message || translate("exercises.sharing.resyncModal.failed");
    }
  }

  function openResync(group: ExerciseGroup) {
    resyncGroupId = group.groupId;
    resyncError = "";
    isResyncOpen = true;
    fetchResyncPreview();
  }

  /** Applies the chosen, reviewed variants; the server refuses (409) if one moved on meanwhile. */
  async function handleApplyResync(selected: Set<string>, overrides: Record<string, string>) {
    if (!resyncPreview) return;
    isResyncing = true;
    resyncError = "";
    try {
      await applyResync(resyncPreview, selected, overrides);
      isResyncOpen = false;
      sharingNotice = translate("exercises.sharing.resyncModal.applied");
      await loadExercises();
    } catch (err: any) {
      if (err?.status === 409) {
        resyncError = translate("exercises.sharing.resyncModal.changedMeanwhile");
        await fetchResyncPreview();
      } else if (err?.status === 404) {
        resyncError = translate("exercises.sharing.resyncModal.unavailable");
      } else {
        resyncError = err?.message || translate("exercises.sharing.resyncModal.failed");
      }
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
    } catch (err: any) {
      unlinkGroup = null;
      sharingError = err?.message || translate("exercises.sharing.unlinkFailed");
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

  function handleExerciseSaved(detail: { sharingFailed?: boolean }) {
    if (detail.sharingFailed) sharingError = translate("exercises.sharing.editorShareFailed");
    loadExercises();
  }

  // Group metadata modal state
  let isGroupModalOpen = $state(false);
  let editingGroup: ExerciseGroup | null = $state.raw(null);
  let groupEditorName = $state("");
  let groupEditorTopicTag = $state("_General");
  let groupEditorGrade = $state("");
  let groupEditorSubject = $state("");
  let isGroupSaving = $state(false);

  function openGroupModal(group: ExerciseGroup) {
    modalError = "";
    editingGroup = group;
    groupEditorName = group.name;
    groupEditorTopicTag = group.topicTag;
    groupEditorGrade = group.grade || "";
    groupEditorSubject = group.subject || "";
    isGroupModalOpen = true;
  }

  async function handleSaveGroupMetadata() {
    modalError = "";
    if (!editingGroup) return;
    if (!groupEditorName.trim()) {
      modalError = translate("exercises.page.groupNameRequired");
      return;
    }

    isGroupSaving = true;
    try {
      const key = get(sessionStore).sessionKey;
      const updatedName = groupEditorName.trim();
      const updatedTopicTag = groupEditorTopicTag.trim() || "_General";
      const updatedGrade = groupEditorGrade.trim() || undefined;
      const updatedSubject = groupEditorSubject.trim() || undefined;

      const memberIds = new Set(editingGroup.allMembers.map((m) => m.ex.id));
      const allLocal = await loadExercisesEncrypted(key);
      const updatedRecords: ExerciseRecord[] = [];

      for (const ex of allLocal) {
        if (
          (ex.exerciseGroupId && ex.exerciseGroupId === editingGroup.groupId) ||
          memberIds.has(ex.id)
        ) {
          const updatedEx: ExerciseRecord = {
            ...ex,
            name: updatedName,
            topicTag: updatedTopicTag,
            grade: updatedGrade,
            subject: updatedSubject,
            updatedAt: new Date().toISOString(),
          };
          await saveExerciseEncrypted(updatedEx, key);
          updatedRecords.push(updatedEx);
        }
      }

      if (isServerBacked()) {
        if (editingGroup.groupId && !editingGroup.groupId.startsWith("name:")) {
          try {
            await api.patch(`/exercises/groups/${editingGroup.groupId}`, {
              name: updatedName,
              topic_tag: updatedTopicTag,
              grade: updatedGrade || null,
              subject: updatedSubject || null,
            });
          } catch (apiErr) {
            console.warn("Failed to patch group on API, updating individual exercises:", apiErr);
            for (const record of updatedRecords) {
              await api.patch(`/exercises/${record.id}`, {
                name: record.name,
                topic_tag: record.topicTag,
                grade: record.grade || null,
                subject: record.subject || null,
              });
            }
          }
        } else {
          for (const record of updatedRecords) {
            await api.patch(`/exercises/${record.id}`, {
              name: record.name,
              topic_tag: record.topicTag,
              grade: record.grade || null,
              subject: record.subject || null,
            });
          }
        }
      }

      isGroupModalOpen = false;
      editingGroup = null;
      await loadExercises();
    } catch (err: any) {
      modalError = translate("exercises.page.groupSaveFailed", { message: err.message });
    } finally {
      isGroupSaving = false;
    }
  }

  // Variant modal state
  let isVariantModalOpen = $state(false);
  let variantBaseEx: ExerciseRecord | null = $state.raw(null);
  let variantKey = $state("");
  let variantName = $state("");
  let variantTopicTag = $state("");
  let variantLatexBody = $state("");

  let initialVariantName = $state("");
  let initialVariantKey = $state("");
  let initialVariantTopicTag = $state("");
  let initialVariantLatexBody = $state("");
  let showVariantConfirmClose = $state(false);

  let isVariantDirty = $derived(
    variantName !== initialVariantName ||
    variantKey !== initialVariantKey ||
    variantTopicTag !== initialVariantTopicTag ||
    variantLatexBody !== initialVariantLatexBody
  );

  function openRegroupModal(ex: ExerciseRecord) {
    modalError = "";
    regroupingExercise = ex;
    regroupTargetGroupId = "NEW";
    isRegroupModalOpen = true;
  }

  async function handleSaveRegroup() {
    modalError = "";
    if (!regroupingExercise) return;
    
    let targetGroupId = regroupTargetGroupId;
    let targetName = regroupingExercise.name;
    let targetTopic = regroupingExercise.topicTag;
    let targetGrade = regroupingExercise.grade;
    let targetSubject = regroupingExercise.subject;

    if (targetGroupId === "NEW") {
      targetGroupId = crypto.randomUUID();
    } else {
      const targetGroup = groupExercises(exercises).find(g => g.groupId === targetGroupId);
      if (targetGroup) {
        targetName = targetGroup.name;
        targetTopic = targetGroup.topicTag;
        targetGrade = targetGroup.grade;
        targetSubject = targetGroup.subject;
        
        const collision = targetGroup.allMembers.find(m => m.ex.variantKey === regroupingExercise!.variantKey);
        if (collision) {
          regroupingExercise.variantKey = `${regroupingExercise.variantKey} (2)`;
        }
      }
    }

    const updatedEx = { 
      ...regroupingExercise, 
      exerciseGroupId: targetGroupId,
      name: targetName,
      topicTag: targetTopic,
      grade: targetGrade,
      subject: targetSubject,
    };

    try {
      const key = get(sessionStore).sessionKey;
      await saveExerciseEncrypted(updatedEx, key);

      await api.patch(`/exercises/${updatedEx.id}`, {
        exercise_group_id: updatedEx.exerciseGroupId,
        name: updatedEx.name,
        topic_tag: updatedEx.topicTag,
        grade: updatedEx.grade || null,
        subject: updatedEx.subject || null,
        variant_key: updatedEx.variantKey || null
      });
      
      isRegroupModalOpen = false;
      regroupingExercise = null;
      await loadExercises();
    } catch (err: any) {
      modalError = translate("exercises.page.regroupFailed", { message: err.message });
    }
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

  async function openDiffModal(ex: ExerciseRecord) {
    modalError = "";
    let groupExs: ExerciseRecord[] = [];
    const key = get(sessionStore).sessionKey;

    if (isServerBacked()) {
      try {
        if (ex.exerciseGroupId) {
          const remoteExs = (await api.get(`/exercises?group_id=${ex.exerciseGroupId}&current_only=false`)) as any[];
          groupExs = remoteExs.map((e: any) => ({
            id: e.id,
            teacherId: e.teacher_id,
            name: e.name,
            topicTag: e.topic_tag,
            grade: e.grade || undefined,
            subject: e.subject || undefined,
            latexBody: e.latex_body,
            maxPoints: e.max_points,
            version: e.version || 1,
            questionType: e.question_type || "free_text",
            penalty: e.penalty || 0,
            exerciseGroupId: e.exercise_group_id || undefined,
            variantKey: e.variant_key || undefined,
            isCurrent: e.is_current,
          }));
        }
      } catch (err) {
        console.warn("Failed to fetch group exercises for diff:", err);
      }
    }

    if (groupExs.length === 0) {
      try {
        const allLocal = await loadExercisesEncrypted(key);
        if (ex.exerciseGroupId) {
          groupExs = allLocal.filter((e) => e.exerciseGroupId === ex.exerciseGroupId);
        }
        if (groupExs.length === 0) {
          groupExs = allLocal.filter((e) => (e.name && ex.name && e.name === ex.name) || e.id === ex.id);
        }
      } catch (err) {
        console.warn("Failed to load local exercises for diff:", err);
      }
    }

    if (groupExs.length === 0) {
      groupExs = [ex];
    }

    groupExs.sort((a, b) => {
      const vA = a.variantKey || "";
      const vB = b.variantKey || "";
      if (vA !== vB) return vA.localeCompare(vB);
      return (a.version || 1) - (b.version || 1);
    });

    diffGroupExercises = groupExs;
    diffLeftId = ex.id;
    const other = diffGroupExercises.find((e) => e.id !== ex.id) || diffGroupExercises[0];
    diffRightId = other.id;
    diffLeftLatex = ex.latexBody || "";
    diffRightLatex = (diffGroupExercises.find((e) => e.id === diffRightId) || ex).latexBody || "";
    lastLoadedLeftId = diffLeftId;
    lastLoadedRightId = diffRightId;
    showDiffConfirmClose = false;
    isDiffModalOpen = true;
  }

  async function saveDiffSide(side: "left" | "right") {
    const ex = side === "left" ? diffLeftEx : diffRightEx;
    const latex = side === "left" ? diffLeftLatex : diffRightLatex;
    if (!ex) return;
    if (side === "left") isSavingDiffLeft = true;
    else isSavingDiffRight = true;
    modalError = "";
    try {
      const updatedMaxPoints = parseExerciseScore(latex);
      const key = get(sessionStore).sessionKey;

      if (isServerBacked()) {
        await api.patch(`/exercises/${ex.id}`, { latex_body: latex, max_points: updatedMaxPoints });
      }

      const updatedRecord: ExerciseRecord = {
        ...ex,
        latexBody: latex,
        maxPoints: updatedMaxPoints,
        updatedAt: new Date().toISOString(),
      };
      await db.exercises.put(await encryptExercise(updatedRecord, key));
      await loadExercises();
    } catch (err: any) {
      modalError = translate(
        side === "left" ? "exercises.page.diffSaveLeftFailed" : "exercises.page.diffSaveRightFailed",
        { message: err.message }
      );
    } finally {
      if (side === "left") isSavingDiffLeft = false;
      else isSavingDiffRight = false;
    }
  }

  function requestCloseDiffModal() {
    if (isDiffLeftDirty || isDiffRightDirty) {
      showDiffConfirmClose = true;
    } else {
      forceCloseDiffModal();
    }
  }

  function forceCloseDiffModal() {
    showDiffConfirmClose = false;
    isDiffModalOpen = false;
  }

  function openVariantModal(ex: ExerciseRecord) {
    modalError = "";
    variantBaseEx = ex;
    variantName = ex.name || "Exercise";
    variantKey = "";
    variantTopicTag = ex.topicTag || "_General";
    variantLatexBody = ex.latexBody || "";

    initialVariantName = variantName;
    initialVariantKey = variantKey;
    initialVariantTopicTag = variantTopicTag;
    initialVariantLatexBody = variantLatexBody;
    showVariantConfirmClose = false;
    isVariantModalOpen = true;
  }

  function requestCloseVariantModal() {
    if (isVariantDirty) {
      showVariantConfirmClose = true;
    } else {
      forceCloseVariantModal();
    }
  }

  function forceCloseVariantModal() {
    showVariantConfirmClose = false;
    isVariantModalOpen = false;
  }

  async function handleSaveVariant() {
    modalError = "";
    if (!variantBaseEx) return;
    if (!variantKey.trim()) {
      modalError = translate("exercises.page.variantKeyRequired");
      return;
    }

    try {
      await api.post(`/exercises/${variantBaseEx.id}/new-variant`, {
        latex_body: variantLatexBody,
        variant_key: variantKey,
      });

      forceCloseVariantModal();
      await loadExercises();
    } catch (err: any) {
      modalError = translate("exercises.page.variantCreateFailed", { message: err.message });
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
    const ex = diffLeftEx;
    const open = isDiffModalOpen;
    const id = diffLeftId;
    const loaded = lastLoadedLeftId;
    if (ex && open && id !== loaded) {
      untrack(() => {
        diffLeftLatex = ex.latexBody || "";
        lastLoadedLeftId = id;
      });
    }
  });

  $effect.pre(() => {
    const ex = diffRightEx;
    const open = isDiffModalOpen;
    const id = diffRightId;
    const loaded = lastLoadedRightId;
    if (ex && open && id !== loaded) {
      untrack(() => {
        diffRightLatex = ex.latexBody || "";
        lastLoadedRightId = id;
      });
    }
  });
</script>

<PageShell width="fluid">
  <PageHeader
    title={$t("exercises.page.title")}
    subtitle={$t("exercises.page.subtitle")}
    helpTopic="exercises"
  >
    {#snippet actions()}
      {#if sharingEnabled && !isLocalFallback}
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
  {#if sharingEnabled && !isLocalFallback}
    <Tabs
      class="mb-4"
      label={$t("exercises.sharing.tabsLabel")}
      value={view}
      onChange={switchView}
      items={[
        { id: "own", label: $t("exercises.sharing.tabOwn"), icon: faBook },
        { id: "shared", label: $t("exercises.sharing.tabShared"), icon: faShareNodes },
        { id: "proposals", label: $t("exercises.contributions.tab"), icon: faCodePullRequest, count: pendingProposals || undefined },
      ]}
    />
  {/if}
  {#if view === "shared" && sharedError}
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
        pillAllLabel={$t("exercises.filterSidebar.allTopics", { count: viewGroups.length })}
        onPillSelect={(topic) => {
          selectedTopic = topic;
          close();
        }}
      />
    {/snippet}

  {#if view === "proposals"}
    <ContributionList
      {incoming}
      {outgoing}
      isLoading={proposalsLoading && incoming.length === 0 && outgoing.length === 0}
      busyId={withdrawingId}
      onReview={openReview}
      onWithdraw={handleWithdraw}
    />
  {:else if view === "shared"}
    <ExerciseGroupList
      mode="shared"
      isLoading={sharedLoading && sharedRows.length === 0}
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
      onEditGroup={openGroupModal}
      onEditExercise={openEditModal}
      onNewVersion={openNewVersionModal}
      onDiff={openDiffModal}
      onRegroup={openRegroupModal}
      onDelete={openDeleteModal}
      onPreview={exercisePreview.open}
      usageMap={$usage}
      onOpenVariant={openVariantModal}
      onCreateFirst={openCreateModal}
      {sharingEnabled}
      {syncStatus}
      onShare={openShareModal}
      onResync={openResync}
      onUnlink={(group) => (unlinkGroup = group)}
      onContribute={openContribute}
    />
  {/if}
  </FilterLayout>
</PageShell>

<PreviewHost flow={exercisePreview} />

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
  onSubmit={handleSubmitContribution}
  onClose={() => (contributeGroupId = "")}
/>

<ReviewContributionModal
  open={!!reviewId}
  detail={reviewDetail}
  busy={isReviewBusy}
  error={reviewError}
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
  onApply={handleApplyResync}
  onClose={() => (isResyncOpen = false)}
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

<VariantModal
  isOpen={isVariantModalOpen}
  error={modalError}
  {variantBaseEx}
  bind:variantKey
  bind:variantLatexBody
  showConfirmClose={showVariantConfirmClose}
  onRequestClose={requestCloseVariantModal}
  onSave={handleSaveVariant}
  onForceCloseConfirm={forceCloseVariantModal}
  onCancelConfirmClose={() => (showVariantConfirmClose = false)}
/>

<ExerciseEditorModal
  isOpen={isEditorOpen}
  editingExercise={editingExercise}
  isCreatingVersion={isCreatingVersion}
  versionBaseEx={versionBaseEx}
  onClose={() => (isEditorOpen = false)}
  onSave={handleExerciseSaved}
/>

<GroupEditModal
  isOpen={isGroupModalOpen}
  error={modalError}
  {editingGroup}
  bind:groupEditorName
  bind:groupEditorTopicTag
  bind:groupEditorGrade
  bind:groupEditorSubject
  {isGroupSaving}
  onSave={handleSaveGroupMetadata}
  onClose={() => (isGroupModalOpen = false)}
/>

<RegroupModal
  isOpen={isRegroupModalOpen}
  error={modalError}
  {regroupingExercise}
  bind:regroupTargetGroupId
  groups={allGroups}
  onSave={handleSaveRegroup}
  onClose={() => (isRegroupModalOpen = false)}
/>

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

<ExerciseDiffModal
  isOpen={isDiffModalOpen}
  error={modalError}
  {activeDiffGroupExercises}
  bind:diffLeftId
  bind:diffRightId
  {diffLeftEx}
  {diffRightEx}
  bind:diffLeftLatex
  bind:diffRightLatex
  {isDiffLeftDirty}
  {isDiffRightDirty}
  {isSavingDiffLeft}
  {isSavingDiffRight}
  onSaveLeft={() => saveDiffSide("left")}
  onSaveRight={() => saveDiffSide("right")}
  onRequestClose={requestCloseDiffModal}
  showConfirmClose={showDiffConfirmClose}
  onForceCloseConfirm={forceCloseDiffModal}
  onCancelConfirmClose={() => (showDiffConfirmClose = false)}
/>