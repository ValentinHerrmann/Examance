<script lang="ts">
  import { type ExerciseGroup, groupExercises } from "$lib/exercise-library/groupExercises";
  import { onMount, untrack } from "svelte";
  import { db } from "$lib/db/db";
  import { sessionStore, awaitSessionReady } from "$lib/stores/session";
  import { storagePolicyStore } from "$lib/stores/storagePolicy";
  import type { ExerciseRecord } from "$lib/db/schema";
  import { loadExercisesEncrypted, saveExerciseEncrypted, encryptExercise } from "$lib/db/dbEncryption";
  import { api } from "$lib/api/client";
  import { parseExerciseScore } from "$lib/latex/scoreParser";
  import { get } from "svelte/store";
  import { isServerBacked } from "$lib/utils/serverBacked";
  import { countActiveFilters, matchesQuery, uniqueSorted } from "$lib/utils/listFilter";
  import { t, translate } from "$lib/i18n";

  import LatexEditor, { type DiffDecorationConfig, type DiffLineDecoration, type DiffLinePaddingDecoration, type DiffWordDecoration, type DiffGapDecoration } from "$lib/components/LatexEditor.svelte";
  import { highlightLatexToHtml } from "$lib/latex/highlighter";
  import ExerciseEditorModal from "$lib/components/ExerciseEditorModal.svelte";
  import ListFilterPanel from "$lib/components/common/ListFilterPanel.svelte";
  import { Alert, Button, FilterLayout, PageHeader, PageShell } from "$lib/components/ui";
  import PreviewHost from "$lib/components/common/PreviewHost.svelte";
  import { createPreviewFlow } from "$lib/stores/previewFlow";
  import { loadExamUsage, usageKey, type ExamUsageEntry } from "$lib/exercise-library/examUsage";
  import { createExpandSet } from "$lib/utils/expandSet";
  import { createLazyMap } from "$lib/utils/lazyMap";
  import { exerciseRepository, mapApiToExerciseRecord } from "$lib/repositories/exerciseRepository";
  import { compileExercisePreview } from "$lib/latex/exercisePreview";
  import { faPlus } from "@fortawesome/free-solid-svg-icons";
  import ExerciseGroupList from "$lib/components/exercise-library/ExerciseGroupList.svelte";
  import GroupEditModal from "$lib/components/exercise-library/GroupEditModal.svelte";
  import RegroupModal from "$lib/components/exercise-library/RegroupModal.svelte";
  import DeleteWithUsageModal from "$lib/components/common/DeleteWithUsageModal.svelte";
  import VariantModal from "$lib/components/exercise-library/VariantModal.svelte";
  import ExerciseDiffModal from "$lib/components/exercise-library/ExerciseDiffModal.svelte";

  let exercises: ExerciseRecord[] = $state.raw([]);
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

  $effect.pre(() => {
    const groups = allGroups;
    const expanded = $expandedGroups;
    untrack(() => {
      for (const g of groups) {
        if (expanded[g.groupId]) for (const vKey of g.variants.keys()) usage.ensure(usageKey(g.groupId, vKey));
      }
    });
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
        useLocal: $storagePolicyStore.latexCompilation === "local",
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

  let isDiffLeftDirty = $derived(diffLeftEx ? diffLeftLatex !== (diffLeftEx.latexBody || "") : false);
  let isDiffRightDirty = $derived(diffRightEx ? diffRightLatex !== (diffRightEx.latexBody || "") : false);

  let availableGrades = $derived(uniqueSorted(exercises, (e) => e.grade));
  let availableSubjects = $derived(uniqueSorted(exercises, (e) => e.subject));

  let filteredExercises = $derived(exercises.filter(
    (ex) =>
      (selectedTopic === "ALL" || ex.topicTag === selectedTopic) &&
      (selectedGrade === "ALL" || ex.grade === selectedGrade) &&
      (selectedSubject === "ALL" || ex.subject === selectedSubject) &&
      matchesQuery(searchQuery, ex.name, ex.topicTag, ex.grade, ex.subject, ex.latexBody)
  ));

  // Grouped view: filter then group
  let allGroups = $derived(groupExercises(exercises));
  // Topic pills count groups, not exercise rows.
  let topicPillOptions = $derived(uniqueSorted(exercises, (e) => e.topicTag).map((topic) => ({
    value: topic,
    label: topic,
    count: allGroups.filter((g) => g.topicTag === topic).length,
  })));
  let filteredGroups = $derived(groupExercises(filteredExercises));

  onMount(() => {
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
          exercises = remoteExs.map(mapApiToExerciseRecord);
          const encryptedExs = await Promise.all(exercises.map(ex => encryptExercise(ex, key)));
          await db.exercises.bulkPut(encryptedExs);
          isLocalFallback = false;
        } catch (apiErr) {
          console.warn(
            "Failed to fetch remote exercises, falling back to IDB:",
            apiErr,
          );
          exercises = await loadExercisesEncrypted(key);
          isLocalFallback = true;
        }
      } else {
        isLocalFallback = false;
        exercises = await loadExercisesEncrypted(key);
      }
    } catch (err: any) {
      errorMsg = err.message || translate("exercises.page.loadFailed");
    }
    usage.reset();
    expandedGroups.prune(groupExercises(exercises).map((g) => g.groupId));
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

  function handleExerciseSaved() {
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

      if ($storagePolicyStore.storageMode !== "all-local") {
        await api.patch(`/exercises/${updatedEx.id}`, {
          exercise_group_id: updatedEx.exerciseGroupId,
          name: updatedEx.name,
          topic_tag: updatedEx.topicTag,
          grade: updatedEx.grade || null,
          subject: updatedEx.subject || null,
          variant_key: updatedEx.variantKey || null
        });
      }
      
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
      if ($storagePolicyStore.storageMode !== "all-local") {
        await api.post(`/exercises/${variantBaseEx.id}/new-variant`, {
          latex_body: variantLatexBody,
          variant_key: variantKey,
        });
      } else {
        const groupId = variantBaseEx.exerciseGroupId || crypto.randomUUID();
        if (!variantBaseEx.exerciseGroupId) {
          variantBaseEx.exerciseGroupId = groupId;
          await db.exercises.put(variantBaseEx);
        }
        const variantRecord: ExerciseRecord = {
          id: crypto.randomUUID(),
          teacherId: $sessionStore.email || "local-teacher",
          name: variantBaseEx.name,
          topicTag: variantBaseEx.topicTag,
          grade: variantBaseEx.grade,
          subject: variantBaseEx.subject,
          latexBody: variantLatexBody,
          maxPoints: parseExerciseScore(variantLatexBody),
          version: 1,
          exerciseGroupId: groupId,
          variantKey: variantKey,
          isCurrent: true,
          questionType: variantBaseEx.questionType,
          options: variantBaseEx.options,
          correctAnswers: variantBaseEx.correctAnswers,
          penalty: variantBaseEx.penalty ?? 0,
          updatedAt: new Date().toISOString(),
        };
        await db.exercises.put(variantRecord);
      }

      forceCloseVariantModal();
      await loadExercises();
    } catch (err: any) {
      modalError = translate("exercises.page.variantCreateFailed", { message: err.message });
    }
  }
</script>

<PageShell width="fluid">
  <PageHeader
    title={$t("exercises.page.title")}
    subtitle={$t("exercises.page.subtitle")}
    helpTopic="exercises"
  >
    {#snippet actions()}
      <Button icon={faPlus} onClick={openCreateModal}>{$t("exercises.page.createButton")}</Button>
    {/snippet}
  </PageHeader>

  {#if isLocalFallback}
    <Alert severity="danger" class="mb-6">{$t("exercises.page.localFallback")}</Alert>
  {/if}
  {#if errorMsg}
    <Alert severity="danger" class="mb-6">{errorMsg}</Alert>
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
        pillAllLabel={$t("exercises.filterSidebar.allTopics", { count: allGroups.length })}
        onPillSelect={(topic) => {
          selectedTopic = topic;
          close();
        }}
      />
    {/snippet}

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
  />
  </FilterLayout>
</PageShell>

<PreviewHost flow={exercisePreview} />

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