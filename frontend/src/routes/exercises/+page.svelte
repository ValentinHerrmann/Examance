<script lang="ts">
  import { type ExerciseGroup, groupExercises } from "$lib/exercise-library/groupExercises";
  import { onMount } from "svelte";
  import { db } from "$lib/db/db";
  import { sessionStore, isAuthenticated, awaitSessionReady } from "$lib/stores/session";
  import { storagePolicyStore } from "$lib/stores/storagePolicy";
  import type { ExerciseRecord } from "$lib/db/schema";
  import { loadExercisesEncrypted, saveExerciseEncrypted, encryptExercise } from "$lib/db/dbEncryption";
  import { api } from "$lib/api/client";
  import { parseExerciseScore } from "$lib/latex/scoreParser";
  import { get } from "svelte/store";
  import { countActiveFilters, matchesQuery, uniqueSorted } from "$lib/utils/listFilter";
  import { t, translate } from "$lib/i18n";

  import LatexEditor, { type DiffDecorationConfig, type DiffLineDecoration, type DiffLinePaddingDecoration, type DiffWordDecoration, type DiffGapDecoration } from "$lib/components/LatexEditor.svelte";
  import { highlightLatexToHtml } from "$lib/latex/highlighter";
  import ExerciseEditorModal from "$lib/components/ExerciseEditorModal.svelte";
  import ListFilterPanel from "$lib/components/common/ListFilterPanel.svelte";
  import { Alert, Button, ConfirmDialog, FilterLayout, PageHeader, PageShell } from "$lib/components/ui";
  import PdfPreviewModal from "$lib/components/PdfPreviewModal.svelte";
  import { loadExamUsage, type ExamUsageEntry } from "$lib/exercise-library/examUsage";
  import { compileExercisePreview } from "$lib/latex/exercisePreview";
  import { getCachedPreview, pdfBytesToUrl } from "$lib/latex/pdfPreview";
  import { faPlus } from "@fortawesome/free-solid-svg-icons";
  import ExerciseGroupList from "$lib/components/exercise-library/ExerciseGroupList.svelte";
  import GroupEditModal from "$lib/components/exercise-library/GroupEditModal.svelte";
  import RegroupModal from "$lib/components/exercise-library/RegroupModal.svelte";
  import DeleteExerciseModal from "$lib/components/exercise-library/DeleteExerciseModal.svelte";
  import VariantModal from "$lib/components/exercise-library/VariantModal.svelte";
  import ExerciseDiffModal from "$lib/components/exercise-library/ExerciseDiffModal.svelte";

  let exercises: ExerciseRecord[] = [];
  let selectedTopic: string = "ALL";
  let selectedGrade: string = "ALL";
  let selectedSubject: string = "ALL";
  let searchQuery: string = "";

  // Badge on the mobile filter button, so an active filter is visible without
  // opening the drawer.
  $: activeFilterCount = countActiveFilters(searchQuery, selectedTopic, selectedGrade, selectedSubject);
  let isLoading = false;
  let errorMsg = "";
  let isLocalFallback = false;

  // Shared Editor modal state
  let isEditorOpen = false;
  let editingExercise: ExerciseRecord | null = null;
  let isCreatingVersion = false;
  let versionBaseEx: ExerciseRecord | null = null;

  // Delete modal state
  let isDeleteModalOpen = false;
  let deletingExercise: ExerciseRecord | null = null;
  let deleteUsageInfo: { examCount: number; exams: { id: string; title: string; datum: string | null }[] } | null = null;
  let isDeleteLoading = false;

  // Regroup modal state
  let isRegroupModalOpen = false;
  let regroupingExercise: ExerciseRecord | null = null;
  let regroupTargetGroupId: string = "";

  // Diff modal state
  let isDiffModalOpen = false;
  let diffLeftId: string = "";
  let diffRightId: string = "";
  let diffGroupExercises: ExerciseRecord[] = [];
  let diffLeftLatex: string = "";
  let diffRightLatex: string = "";
  let isSavingDiffLeft = false;
  let isSavingDiffRight = false;
  let showDiffConfirmClose = false;

  let lastLoadedLeftId = "";
  let lastLoadedRightId = "";

  // Expanded groups tracking — use object for Svelte reactivity
  let expandedGroups: { [groupId: string]: boolean } = {};

  /* ── Exercise Grouping ── */




  function toggleGroup(groupId: string) {
    expandedGroups = { ...expandedGroups, [groupId]: !expandedGroups[groupId] };
  }

  /** Exams using each variant of a group; loaded lazily once its card is expanded. */
  let usageMap = new Map<string, ExamUsageEntry[] | "loading">();

  function ensureUsage(group: ExerciseGroup) {
    for (const [vKey, members] of group.variants) {
      const mapKey = `${group.groupId}|${vKey}`;
      if (usageMap.has(mapKey)) continue;
      usageMap.set(mapKey, "loading");
      usageMap = usageMap;
      loadExamUsage(members.map((m) => m.ex.id))
        .catch((err) => {
          console.warn("Failed to load exam usage:", err);
          return [] as ExamUsageEntry[];
        })
        .then((list) => {
          usageMap.set(mapKey, list);
          usageMap = usageMap;
        });
    }
  }

  $: for (const g of allGroups) if (expandedGroups[g.groupId]) ensureUsage(g);

  let previewEx: ExerciseRecord | null = null;
  let isPreviewOpen = false;
  let isPreviewCompileAsk = false;
  let isPreviewBusy = false;
  let previewNotice = "";
  let previewError = "";
  let previewAngabeUrl: string | null = null;
  let previewLoesungUrl: string | null = null;

  function resetPreviewUrls() {
    if (previewAngabeUrl) URL.revokeObjectURL(previewAngabeUrl);
    if (previewLoesungUrl) URL.revokeObjectURL(previewLoesungUrl);
    previewAngabeUrl = previewLoesungUrl = null;
  }

  function openPreview(ex: ExerciseRecord) {
    previewEx = ex;
    previewError = "";
    resetPreviewUrls();
    const cached = getCachedPreview("exercise", ex.id);
    if (cached.angabe || cached.loesung) {
      previewAngabeUrl = cached.angabe;
      previewLoesungUrl = cached.loesung;
      isPreviewOpen = true;
    } else {
      isPreviewCompileAsk = true;
    }
  }

  async function compilePreview() {
    const ex = previewEx;
    isPreviewCompileAsk = false;
    if (!ex) return;
    isPreviewOpen = true;
    isPreviewBusy = true;
    previewNotice = "";
    try {
      const res = await compileExercisePreview({
        cacheId: ex.id!,
        name: ex.name ?? "",
        latexBody: ex.latexBody ?? "",
        resourceOwnerId: ex.id!,
        staged: false,
        useLocal: $storagePolicyStore.latexCompilation === "local",
        key: get(sessionStore).sessionKey,
        onStatus: (status) => {
          previewNotice =
            status === "downloading"
              ? translate("exam.page.preview.loadingCompiler")
              : translate("common.previewCompiling");
        },
      });
      previewAngabeUrl = pdfBytesToUrl(res.angabe.pdfBytes);
      previewLoesungUrl = pdfBytesToUrl(res.loesung.pdfBytes);
      if (res.missingGraphics.length > 0) {
        previewError = `Preview rendered, but a graphic could not be loaded: ${res.missingGraphics[0]}`;
      }
    } catch (err: any) {
      previewError = translate("common.previewFailed", { message: err.message || "" });
    } finally {
      isPreviewBusy = false;
    }
  }

  function closePreview() {
    isPreviewOpen = false;
    resetPreviewUrls();
  }

  $: activeDiffGroupExercises = diffGroupExercises.map(
    (e) => exercises.find((x) => x.id === e.id) || e
  );

  function getDiffSelectLabel(ex: ExerciseRecord): string {
    const name = ex.name || translate("exercises.untitled");
    const v = ex.version || 1;
    const variantStr = ex.variantKey ? translate("exercises.page.diffSelectVariantSuffix", { key: ex.variantKey }) : "";
    return `${name} (v${v}${variantStr})`;
  }

  // Lazy: only look up exercises when the diff modal is open
  $: diffLeftEx = isDiffModalOpen
    ? (exercises.find((e) => e.id === diffLeftId) || activeDiffGroupExercises.find((e) => e.id === diffLeftId))
    : null;
  $: diffRightEx = isDiffModalOpen
    ? (exercises.find((e) => e.id === diffRightId) || activeDiffGroupExercises.find((e) => e.id === diffRightId))
    : null;

  $: if (diffLeftEx && isDiffModalOpen) {
    if (diffLeftId !== lastLoadedLeftId) {
      diffLeftLatex = diffLeftEx.latexBody || "";
      lastLoadedLeftId = diffLeftId;
    }
  }

  $: if (diffRightEx && isDiffModalOpen) {
    if (diffRightId !== lastLoadedRightId) {
      diffRightLatex = diffRightEx.latexBody || "";
      lastLoadedRightId = diffRightId;
    }
  }

  $: isDiffLeftDirty = diffLeftEx ? diffLeftLatex !== (diffLeftEx.latexBody || "") : false;
  $: isDiffRightDirty = diffRightEx ? diffRightLatex !== (diffRightEx.latexBody || "") : false;

  $: availableGrades = uniqueSorted(exercises, (e) => e.grade);
  $: availableSubjects = uniqueSorted(exercises, (e) => e.subject);

  $: filteredExercises = exercises.filter(
    (ex) =>
      (selectedTopic === "ALL" || ex.topicTag === selectedTopic) &&
      (selectedGrade === "ALL" || ex.grade === selectedGrade) &&
      (selectedSubject === "ALL" || ex.subject === selectedSubject) &&
      matchesQuery(searchQuery, ex.name, ex.topicTag, ex.grade, ex.subject, ex.latexBody)
  );

  // Grouped view: filter then group
  $: allGroups = groupExercises(exercises);
  // Topic pills count groups, not exercise rows.
  $: topicPillOptions = uniqueSorted(exercises, (e) => e.topicTag).map((topic) => ({
    value: topic,
    label: topic,
    count: allGroups.filter((g) => g.topicTag === topic).length,
  }));
  $: filteredGroups = groupExercises(filteredExercises);

  onMount(() => {
    loadExercises();
  });

  async function loadExercises() {
    usageMap = new Map();
    await awaitSessionReady();
    isLoading = true;
    errorMsg = "";
    const key = get(sessionStore).sessionKey;
    try {
      if ($isAuthenticated && $storagePolicyStore.storageMode !== "all-local") {
        try {
          const remoteExs = (await api.get("/exercises", { silentError: true })) as any[];
          exercises = remoteExs.map((e: any) => ({
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
    } finally {
      isLoading = false;
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

  function handleExerciseSaved() {
    loadExercises();
  }

  // Group metadata modal state
  let isGroupModalOpen = false;
  let editingGroup: ExerciseGroup | null = null;
  let groupEditorName = "";
  let groupEditorTopicTag = "_General";
  let groupEditorGrade = "";
  let groupEditorSubject = "";
  let isGroupSaving = false;

  function openGroupModal(group: ExerciseGroup) {
    editingGroup = group;
    groupEditorName = group.name;
    groupEditorTopicTag = group.topicTag;
    groupEditorGrade = group.grade || "";
    groupEditorSubject = group.subject || "";
    isGroupModalOpen = true;
  }

  async function handleSaveGroupMetadata() {
    if (!editingGroup) return;
    if (!groupEditorName.trim()) {
      alert(translate("exercises.page.groupNameRequired"));
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

      if ($isAuthenticated && $storagePolicyStore.storageMode !== "all-local") {
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
      alert(translate("exercises.page.groupSaveFailed", { message: err.message }));
    } finally {
      isGroupSaving = false;
    }
  }

  // Variant modal state
  let isVariantModalOpen = false;
  let variantBaseEx: ExerciseRecord | null = null;
  let variantKey = "Moebel";
  let variantName = "";
  let variantTopicTag = "_Vererbung";
  let variantLatexBody = "";

  let initialVariantName = "";
  let initialVariantKey = "";
  let initialVariantTopicTag = "";
  let initialVariantLatexBody = "";
  let showVariantConfirmClose = false;

  $: isVariantDirty =
    variantName !== initialVariantName ||
    variantKey !== initialVariantKey ||
    variantTopicTag !== initialVariantTopicTag ||
    variantLatexBody !== initialVariantLatexBody;

  function openRegroupModal(ex: ExerciseRecord) {
    regroupingExercise = ex;
    regroupTargetGroupId = "NEW";
    isRegroupModalOpen = true;
  }

  async function handleSaveRegroup() {
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
      alert(translate("exercises.page.regroupFailed", { message: err.message }));
    }
  }

  async function openDeleteModal(ex: ExerciseRecord) {
    deletingExercise = ex;
    deleteUsageInfo = null;
    isDeleteLoading = true;
    isDeleteModalOpen = true;

    if ($isAuthenticated && $storagePolicyStore.storageMode !== "all-local") {
      try {
        const usage = (await api.get(`/exercises/${ex.id}/usage`)) as any;
        deleteUsageInfo = {
          examCount: usage.exam_count,
          exams: usage.exams,
        };
      } catch (err) {
        console.warn("Failed to check exercise usage:", err);
        deleteUsageInfo = { examCount: 0, exams: [] };
      }
    } else {
      deleteUsageInfo = { examCount: 0, exams: [] };
    }
    isDeleteLoading = false;
  }

  async function handleConfirmDelete() {
    if (!deletingExercise) return;
    try {
      if ($isAuthenticated && $storagePolicyStore.storageMode !== "all-local") {
        await api.delete(`/exercises/${deletingExercise.id}`);
      }
      await db.exercises.delete(deletingExercise.id);
      // Attached resource files have no owner once the exercise is gone.
      await db.exerciseResources.where("exerciseId").equals(deletingExercise.id).delete();
      await loadExercises();
      isDeleteModalOpen = false;
      deletingExercise = null;
    } catch (err: any) {
      alert(translate("exercises.page.deleteFailed", { message: err.message }));
    }
  }

  async function openDiffModal(ex: ExerciseRecord) {
    let groupExs: ExerciseRecord[] = [];
    const key = get(sessionStore).sessionKey;

    if ($isAuthenticated && $storagePolicyStore.storageMode !== "all-local") {
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

  async function handleSaveDiffLeft() {
    if (!diffLeftEx) return;
    isSavingDiffLeft = true;
    try {
      const updatedMaxPoints = parseExerciseScore(diffLeftLatex);
      const key = get(sessionStore).sessionKey;

      if ($isAuthenticated && $storagePolicyStore.storageMode !== "all-local") {
        await api.patch(`/exercises/${diffLeftEx.id}`, {
          latex_body: diffLeftLatex,
          max_points: updatedMaxPoints,
        });
      }

      const updatedRecord: ExerciseRecord = {
        ...diffLeftEx,
        latexBody: diffLeftLatex,
        maxPoints: updatedMaxPoints,
        updatedAt: new Date().toISOString(),
      };

      const encrypted = await encryptExercise(updatedRecord, key);
      await db.exercises.put(encrypted);
      await loadExercises();
    } catch (err: any) {
      alert(translate("exercises.page.diffSaveLeftFailed", { message: err.message }));
    } finally {
      isSavingDiffLeft = false;
    }
  }

  async function handleSaveDiffRight() {
    if (!diffRightEx) return;
    isSavingDiffRight = true;
    try {
      const updatedMaxPoints = parseExerciseScore(diffRightLatex);
      const key = get(sessionStore).sessionKey;

      if ($isAuthenticated && $storagePolicyStore.storageMode !== "all-local") {
        await api.patch(`/exercises/${diffRightEx.id}`, {
          latex_body: diffRightLatex,
          max_points: updatedMaxPoints,
        });
      }

      const updatedRecord: ExerciseRecord = {
        ...diffRightEx,
        latexBody: diffRightLatex,
        maxPoints: updatedMaxPoints,
        updatedAt: new Date().toISOString(),
      };

      const encrypted = await encryptExercise(updatedRecord, key);
      await db.exercises.put(encrypted);
      await loadExercises();
    } catch (err: any) {
      alert(translate("exercises.page.diffSaveRightFailed", { message: err.message }));
    } finally {
      isSavingDiffRight = false;
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
    variantBaseEx = ex;
    variantName = ex.name || "Exercise";
    variantKey = "Moebel";
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
    if (!variantBaseEx) return;
    if (!variantKey.trim()) {
      alert(translate("exercises.page.variantKeyRequired"));
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
      alert(translate("exercises.page.variantCreated", { key: variantKey }));
    } catch (err: any) {
      alert(translate("exercises.page.variantCreateFailed", { message: err.message }));
    }
  }
</script>

<PageShell width="fluid">
  <PageHeader
    title={$t("exercises.page.title")}
    subtitle={$t("exercises.page.subtitle")}
    helpTopic="exercises"
  >
    <svelte:fragment slot="actions">
      <Button icon={faPlus} onClick={openCreateModal}>{$t("exercises.page.createButton")}</Button>
    </svelte:fragment>
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
  >
    <svelte:fragment slot="filters" let:close>
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
    </svelte:fragment>

  <ExerciseGroupList
    {isLoading}
    {filteredGroups}
    {expandedGroups}
    onToggleGroup={toggleGroup}
    onEditGroup={openGroupModal}
    onEditExercise={openEditModal}
    onNewVersion={openNewVersionModal}
    onDiff={openDiffModal}
    onRegroup={openRegroupModal}
    onDelete={openDeleteModal}
    onPreview={openPreview}
    {usageMap}
    onOpenVariant={openVariantModal}
    onCreateFirst={openCreateModal}
  />
  </FilterLayout>
</PageShell>

<ConfirmDialog
  open={isPreviewCompileAsk}
  title={$t("common.previewNoneTitle")}
  message={$t("common.previewNoneText")}
  confirmText={$t("common.previewCompile")}
  cancelText={$t("common.cancel")}
  role="dialog"
  onConfirm={compilePreview}
  onCancel={() => (isPreviewCompileAsk = false)}
/>

<PdfPreviewModal
  open={isPreviewOpen}
  title={previewEx?.name || $t("exercises.untitled")}
  angabeUrl={previewAngabeUrl}
  loesungUrl={previewLoesungUrl}
  busy={isPreviewBusy}
  notice={previewNotice}
  error={previewError}
  onClose={closePreview}
/>

<VariantModal
  isOpen={isVariantModalOpen}
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
  on:close={() => (isEditorOpen = false)}
  on:save={handleExerciseSaved}
/>

<GroupEditModal
  isOpen={isGroupModalOpen}
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
  {regroupingExercise}
  bind:regroupTargetGroupId
  groups={allGroups}
  onSave={handleSaveRegroup}
  onClose={() => (isRegroupModalOpen = false)}
/>

<DeleteExerciseModal
  isOpen={isDeleteModalOpen}
  {deletingExercise}
  {isDeleteLoading}
  {deleteUsageInfo}
  onConfirm={handleConfirmDelete}
  onClose={() => (isDeleteModalOpen = false)}
/>

<ExerciseDiffModal
  isOpen={isDiffModalOpen}
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
  onSaveLeft={handleSaveDiffLeft}
  onSaveRight={handleSaveDiffRight}
  onRequestClose={requestCloseDiffModal}
  showConfirmClose={showDiffConfirmClose}
  onForceCloseConfirm={forceCloseDiffModal}
  onCancelConfirmClose={() => (showDiffConfirmClose = false)}
/>