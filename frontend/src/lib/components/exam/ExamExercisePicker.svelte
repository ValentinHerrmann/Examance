<script lang="ts">
  import { get } from "svelte/store";
  import { api } from "#lib/api/client";
  import { loadExercisesEncrypted, type McGroup } from "#lib/db/dbEncryption";
  import type { ExerciseRecord } from "#lib/db/schema";
  import { groupExercises } from "#lib/exercise-library/groupExercises";
  import type { ExamItemRef } from "#lib/grading/omrTemplatePrep";
  import { t } from "#lib/i18n";
  import { mapApiToExerciseRecord } from "#lib/repositories/exerciseRepository";
  import { isAuthenticated, sessionStore } from "#lib/stores/session";
  import {
    applyGroup,
    buildMcGroupMembership,
    canFinalizeGroup,
    moveStaged,
    toggleStaged,
  } from "#lib/exam/mcGroupStaging";
  import { matchesExerciseFilters, uniqueSorted } from "#lib/utils/listFilter";
  import { ConfirmDialog } from "#lib/components/ui";
  import ExamLibraryModal from "#lib/components/exam/ExamLibraryModal.svelte";

  /** Adds library exercises and MC groups to the exam. The MC tab is part of the same dialog, so group editing shares its open/close lifecycle and selection with the library picking and lives here too. */
  interface Props {
    /** The exam's linked exercises, including MC group members. */
    exercises: ExerciseRecord[];
    mcGroups: McGroup[];
    examItems: ExamItemRef[];
    libraryExercises: ExerciseRecord[];
    /** Persists the exam's links after `exercises` / `mcGroups` changed. */
    onSaveLinks: () => Promise<void>;
    onQuickEdit: (ex: ExerciseRecord) => void;
    onNewExercise: () => void;
  }

  let {
    exercises = $bindable(),
    mcGroups = $bindable(),
    examItems = $bindable(),
    libraryExercises = $bindable(),
    onSaveLinks,
    onQuickEdit,
    onNewExercise,
  }: Props = $props();

  let isLibraryModalOpen = $state(false);
  let selectedLibraryIds: string[] = $state.raw([]);
  let initialSelectedLibraryIds: string[] = $state.raw([]);
  let showLibraryConfirm = $state(false);
  let librarySearch = $state("");
  let activeVariantPerGroup: Record<string, string> = $state.raw({});

  let isLibraryDirty = $derived(
    isLibraryModalOpen &&
      (selectedLibraryIds.length !== initialSelectedLibraryIds.length ||
        selectedLibraryIds.some((id, i) => id !== initialSelectedLibraryIds[i])),
  );

  let mcStagingIds: string[] = $state.raw([]);
  let editingMcGroupId: string | null = $state(null);
  let selectedGradeFilter = $state("ALL");
  let selectedSubjectFilter = $state("ALL");
  let selectedTopicFilter = $state("ALL");

  let filteredLibrary = $derived(
    libraryExercises.filter((ex) =>
      matchesExerciseFilters(
        ex,
        { query: librarySearch, grade: selectedGradeFilter, subject: selectedSubjectFilter },
        true,
      ),
    ),
  );

  let filteredGroups = $derived(groupExercises(filteredLibrary));
  let availableGrades = $derived(uniqueSorted(libraryExercises, (e) => e.grade));
  let availableSubjects = $derived(uniqueSorted(libraryExercises, (e) => e.subject));
  let totalVariantsCount = $derived(libraryExercises.length);

  let editingMcGroup = $derived(mcGroups.find((g) => g.id === editingMcGroupId) ?? null);
  let mcGroupMembership = $derived(buildMcGroupMembership(mcGroups, editingMcGroupId));

  function setGroupVariant(groupId: string, vKey: string) {
    activeVariantPerGroup = { ...activeVariantPerGroup, [groupId]: vKey };
  }

  /** Loads the library and opens the dialog with the exam's standalone exercises ticked. */
  export async function open() {
    if (!editingMcGroupId) {
      mcStagingIds = [];
    }
    const key = get(sessionStore).sessionKey;
    try {
      if ($isAuthenticated) {
        const remoteExs = (await api.get("/exercises")) as any[];
        libraryExercises = remoteExs.map(mapApiToExerciseRecord);
      } else {
        libraryExercises = await loadExercisesEncrypted(key);
      }
      // The library selection holds standalone exercises only; group members are managed through their group (MC tab), never ticked as standalone too.
      const groupedIds = new Set(mcGroups.flatMap((g) => g.memberIds));
      selectedLibraryIds = exercises.filter((e) => !groupedIds.has(e.id)).map((e) => e.id);
      initialSelectedLibraryIds = [...selectedLibraryIds];
      activeVariantPerGroup = {};
      for (const ex of exercises) {
        const groupId = ex.exerciseGroupId || `name:${ex.name || "Untitled"}`;
        if (ex.variantKey) {
          activeVariantPerGroup = { ...activeVariantPerGroup, [groupId]: ex.variantKey };
        }
      }
      showLibraryConfirm = false;
      isLibraryModalOpen = true;
    } catch (err) {
      console.error("Failed to load library exercises:", err);
    }
  }

  /** A new exercise written from this dialog joins the library list and the selection (M1). */
  export function addCreatedExercise(exercise: ExerciseRecord) {
    libraryExercises = [...libraryExercises.filter((ex) => ex.id !== exercise.id), exercise];
    if (!selectedLibraryIds.includes(exercise.id)) selectedLibraryIds = [...selectedLibraryIds, exercise.id];
  }

  /** Opens the dialog on the MC tab with the group's members staged. */
  export function editMcGroup(groupId: string) {
    if (!mcGroups.some((g) => g.id === groupId)) return;
    editingMcGroupId = groupId;
    mcStagingIds = [...(mcGroups.find((g) => g.id === groupId)?.memberIds ?? [])];
    open();
  }

  function requestCloseLibraryModal() {
    if (isLibraryDirty) {
      showLibraryConfirm = true;
    } else {
      forceCloseLibraryModal();
    }
  }

  function forceCloseLibraryModal() {
    showLibraryConfirm = false;
    isLibraryModalOpen = false;
    editingMcGroupId = null;
    mcStagingIds = [];
  }

  function toggleMcStaging(id: string) {
    mcStagingIds = toggleStaged(mcStagingIds, id, mcGroupMembership);
  }

  function reorderMcStaging(index: number, direction: "up" | "down") {
    mcStagingIds = moveStaged(mcStagingIds, index, direction);
  }

  async function finalizeMcGroup(title: string, scoringText: string) {
    if (!canFinalizeGroup(mcStagingIds)) return;
    const memberIds = [...mcStagingIds];
    const previousMemberIds = new Set(editingMcGroup?.memberIds ?? []);
    mcGroups = applyGroup(mcGroups, { editingId: editingMcGroupId, title, scoringText, memberIds });
    adoptGroupMembers(memberIds, previousMemberIds);
    editingMcGroupId = null;
    mcStagingIds = [];
    await onSaveLinks();
  }

  /** Syncs `exercises` with a group change: new members are linked only as group members (an exercise is linked once), and members dropped from an edited group leave the exam. */
  function adoptGroupMembers(memberIds: string[], previousMemberIds: Set<string>) {
    const members = new Set(memberIds);
    const removed = new Set([...previousMemberIds].filter((id) => !members.has(id)));
    const linkedIds = new Set(exercises.map((e) => e.id));
    const added = memberIds
      .filter((id) => !linkedIds.has(id))
      .map((id) => libraryExercises.find((e) => e.id === id))
      .filter((e): e is ExerciseRecord => Boolean(e));
    exercises = [...exercises.filter((e) => !removed.has(e.id)), ...added];
    selectedLibraryIds = selectedLibraryIds.filter((id) => !members.has(id));
    examItems = examItems.filter((item) => !(item.type === "exercise" && members.has(item.id)));
  }

  function toggleLibrarySelection(id: string) {
    if (selectedLibraryIds.includes(id)) {
      selectedLibraryIds = selectedLibraryIds.filter((i) => i !== id);
    } else {
      selectedLibraryIds = [...selectedLibraryIds, id];
    }
  }

  async function applyLibrarySelection() {
    const groupedIds = new Set(mcGroups.flatMap((g) => g.memberIds));
    const standalone = selectedLibraryIds
      .filter((id) => !groupedIds.has(id))
      .map((id) => libraryExercises.find((ex) => ex.id === id))
      .filter((ex): ex is ExerciseRecord => Boolean(ex))
      .map((ex, idx) => ({ ...ex, orderIndex: idx + 1 }));
    const groupMembers = exercises.filter((ex) => groupedIds.has(ex.id));

    exercises = [...standalone, ...groupMembers];
    await onSaveLinks();
    isLibraryModalOpen = false;
  }
</script>

<ExamLibraryModal
  isOpen={isLibraryModalOpen}
  {filteredGroups}
  {totalVariantsCount}
  {availableGrades}
  {availableSubjects}
  bind:librarySearch
  bind:selectedGradeFilter
  bind:selectedSubjectFilter
  bind:selectedTopicFilter
  {selectedLibraryIds}
  {activeVariantPerGroup}
  {libraryExercises}
  {mcStagingIds}
  {editingMcGroup}
  {mcGroupMembership}
  onToggleMcStaging={toggleMcStaging}
  onReorderMcStaging={reorderMcStaging}
  onFinalizeMcGroup={finalizeMcGroup}
  onToggleSelection={toggleLibrarySelection}
  onSetGroupVariant={setGroupVariant}
  onApply={applyLibrarySelection}
  onRequestClose={requestCloseLibraryModal}
  {onQuickEdit}
  {onNewExercise}
/>

<ConfirmDialog
  open={showLibraryConfirm}
  title={$t("exam.page.library.discardTitle")}
  message={$t("exam.page.library.discardMessage")}
  confirmText={$t("exam.page.metadata.discardConfirm")}
  cancelText={$t("exam.page.metadata.discardKeepEditing")}
  severity="danger"
  role="dialog"
  onConfirm={forceCloseLibraryModal}
  onCancel={() => (showLibraryConfirm = false)}
/>
