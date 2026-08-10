<script lang="ts">
  import "./+page.css";
  import { onMount } from "svelte";
  import { db } from "$lib/db/db";
  import { sessionStore, isAuthenticated } from "$lib/stores/session";
  import { storagePolicyStore } from "$lib/stores/storagePolicy";
  import type { ExerciseRecord } from "$lib/db/schema";
  import { loadExercisesEncrypted, saveExerciseEncrypted, encryptExercise } from "$lib/db/dbEncryption";
  import { api } from "$lib/api/client";
  import { parseExerciseScore } from "$lib/latex/scoreParser";
  import { get } from "svelte/store";

  import LatexEditor, { type DiffDecorationConfig, type DiffLineDecoration, type DiffLinePaddingDecoration, type DiffWordDecoration, type DiffGapDecoration } from "$lib/components/LatexEditor.svelte";
  import { highlightLatexToHtml } from "$lib/latex/highlighter";
  import ExerciseEditorModal from "$lib/components/ExerciseEditorModal.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import ExerciseFilterSidebar from "$lib/components/exercise-library/ExerciseFilterSidebar.svelte";
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
  let filterCollapsed = true;
  let isLoading = false;
  let errorMsg = "";
  let isLocalFallback = false;
  let isSyncingExercises = false;

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

  interface VariantMember {
    ex: ExerciseRecord;
    variantLabel: string;
    version: number;
    isCurrent: boolean;
  }

  interface ExerciseGroup {
    groupId: string;
    name: string;
    topicTag: string;
    grade?: string;
    subject?: string;
    maxPoints: number;
    minPoints: number;
    variants: Map<string, VariantMember[]>;
    allMembers: VariantMember[];
  }

  function groupExercises(exs: ExerciseRecord[]): ExerciseGroup[] {
    const buckets = new Map<string, ExerciseRecord[]>();

    for (const ex of exs) {
      const key = ex.exerciseGroupId || (`name:${ex.name || "Untitled"}`);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(ex);
    }

    const groups: ExerciseGroup[] = [];

    for (const [groupId, members] of buckets) {
      const currentMembers = members.filter((m) => m.isCurrent !== false);
      if (currentMembers.length === 0) continue;

      const name = currentMembers[0]?.name || "Untitled";
      const topicTag = currentMembers[0]?.topicTag || "_General";
      const grade = currentMembers[0]?.grade;
      const subject = currentMembers[0]?.subject;

      const variants = new Map<string, VariantMember[]>();
      for (const ex of currentMembers) {
        const vKey = ex.variantKey || "_General";
        if (!variants.has(vKey)) variants.set(vKey, []);
        variants.get(vKey)!.push({
          ex,
          variantLabel: vKey,
          version: ex.version || 1,
          isCurrent: ex.isCurrent !== false,
        });
      }

      const sortedVariants = new Map<string, VariantMember[]>();
      const keys = [...variants.keys()].sort((a, b) => {
        if (a === "_General") return -1;
        if (b === "_General") return 1;
        return a.localeCompare(b);
      });
      for (const k of keys) sortedVariants.set(k, variants.get(k)!);

      for (const [, vMembers] of sortedVariants) {
        vMembers.sort((a, b) => b.version - a.version);
      }

      const allMembers: VariantMember[] = [];
      for (const [, vMembers] of sortedVariants) {
        allMembers.push(...vMembers);
      }

      const scores = allMembers.map((m) => parseExerciseScore(m.ex.latexBody || "") || m.ex.maxPoints || 0);
      const maxPoints = scores.length > 0 ? Math.max(...scores) : 0;
      const minPoints = scores.length > 0 ? Math.min(...scores) : 0;

      groups.push({ groupId, name, topicTag, grade, subject, maxPoints, minPoints, variants: sortedVariants, allMembers });
    }

    groups.sort((a, b) => a.name.localeCompare(b.name));
    return groups;
  }

  function toggleGroup(groupId: string) {
    expandedGroups = { ...expandedGroups, [groupId]: !expandedGroups[groupId] };
  }

  $: activeDiffGroupExercises = diffGroupExercises.map(
    (e) => exercises.find((x) => x.id === e.id) || e
  );

  function getDiffSelectLabel(ex: ExerciseRecord): string {
    const name = ex.name || "Untitled";
    const v = ex.version || 1;
    const variantStr = ex.variantKey ? `, Variant: ${ex.variantKey}` : "";
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

  $: availableTopics = Array.from(
    new Set(
      exercises.map((e) => e.topicTag).filter((t): t is string => Boolean(t)),
    ),
  ).sort();

  $: availableGrades = Array.from(
    new Set(
      exercises.map((e) => e.grade).filter((g): g is string => Boolean(g)),
    ),
  ).sort();

  $: availableSubjects = Array.from(
    new Set(
      exercises.map((e) => e.subject).filter((s): s is string => Boolean(s)),
    ),
  ).sort();

  $: filteredExercises = exercises.filter((ex) => {
    const matchesTopic =
      selectedTopic === "ALL" || ex.topicTag === selectedTopic;
    const matchesGrade =
      selectedGrade === "ALL" || ex.grade === selectedGrade;
    const matchesSubject =
      selectedSubject === "ALL" || ex.subject === selectedSubject;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      (ex.name && ex.name.toLowerCase().includes(q)) ||
      (ex.topicTag && ex.topicTag.toLowerCase().includes(q)) ||
      (ex.grade && ex.grade.toLowerCase().includes(q)) ||
      (ex.subject && ex.subject.toLowerCase().includes(q)) ||
      (ex.latexBody && ex.latexBody.toLowerCase().includes(q));
    return matchesTopic && matchesGrade && matchesSubject && matchesSearch;
  });

  // Grouped view: filter then group
  $: allGroups = groupExercises(exercises);
  $: filteredGroups = groupExercises(filteredExercises);

  onMount(() => {
    loadExercises();
  });

  async function loadExercises() {
    isLoading = true;
    errorMsg = "";
    const key = get(sessionStore).sessionKey;
    try {
      if ($isAuthenticated && $storagePolicyStore.storageMode !== "all-local") {
        try {
          const remoteExs = (await api.get("/exercises")) as any[];
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
      errorMsg = err.message || "Failed to load exercise library.";
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
      alert("Group name is required.");
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
      alert(`Failed to save group metadata: ${err.message}`);
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
      alert(`Failed to regroup: ${err.message}`);
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
      await loadExercises();
      isDeleteModalOpen = false;
      deletingExercise = null;
    } catch (err: any) {
      alert(`Failed to delete exercise: ${err.message}`);
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
      alert(`Failed to save left exercise: ${err.message}`);
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
      alert(`Failed to save right exercise: ${err.message}`);
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
      alert("Variant key (e.g. Moebel, Fahrzeug, Wildtier) is required.");
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
      alert(`New variant "${variantKey}" created.`);
    } catch (err: any) {
      alert(`Failed to create variant: ${err.message}`);
    }
  }
</script>

<div class="exercises-library-page">


  <div class="exercises-page-header">
    <div>
      <h2>Exercise Library (Aufgabenkatalog)</h2>
      <p class="exercises-subtitle">
        Reusable LaTeX exercise collection live-linked across your exams.
      </p>
    </div>
    <button class="exercises-create-btn" on:click={openCreateModal}
      >+ Create New Exercise</button
    >
  </div>

  {#if errorMsg}
    <div class="exercises-error-banner">{errorMsg}</div>
  {/if}

  <button class="exercises-filter-toggle-btn" on:click={() => (filterCollapsed = !filterCollapsed)}>
    {filterCollapsed ? '▼ Show Filters' : '▲ Hide Filters'}
  </button>

  <div class="exercises-library-layout">
    <ExerciseFilterSidebar
      bind:searchQuery
      bind:selectedGrade
      bind:selectedSubject
      selectedTopic={selectedTopic}
      {filterCollapsed}
      {availableTopics}
      {availableGrades}
      {availableSubjects}
      {allGroups}
      onTopicChange={(topic) => (selectedTopic = topic)}
    />

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
      onOpenVariant={openVariantModal}
      onCreateFirst={openCreateModal}
    />
  </div>
</div>

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