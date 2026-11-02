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
    buildMcGroupMembership,
    commitStagedGroup,
    DEFAULT_MC_GROUP_SCORING_TEXT,
    DEFAULT_MC_GROUP_TITLE,
    idsChanged,
    moveStaged,
    toggleStaged,
    type McGroupDraft,
  } from "#lib/exam/mcGroupStaging";
  import { createDirtyClose } from "#lib/utils/dirtyClose.svelte";
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
  let librarySearch = $state("");
  let activeVariantPerGroup: Record<string, string> = $state.raw({});

  // The whole MC draft (questions, title, scoring) lives here: the footer's apply commits it and the dirty check compares it (#175).
  let mcStagingIds: string[] = $state.raw([]);
  let mcDraftTitle = $state(DEFAULT_MC_GROUP_TITLE);
  let mcDraftScoring = $state(DEFAULT_MC_GROUP_SCORING_TEXT);
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

  /** A new group is pending once questions are staged; an edited one once its questions, title or scoring differ. */
  let mcDraftDirty = $derived(
    editingMcGroup
      ? idsChanged(mcStagingIds, editingMcGroup.memberIds) ||
          mcDraftTitle !== editingMcGroup.title ||
          mcDraftScoring !== editingMcGroup.scoringText
      : mcStagingIds.length > 0,
  );
  /** Whether the footer's apply also commits a group (a new one, or the edited one, which an empty draft removes). */
  let mcGroupPending = $derived(Boolean(editingMcGroup) || mcStagingIds.length > 0);

  const libraryClose = createDirtyClose({
    isDirty: () => idsChanged(selectedLibraryIds, initialSelectedLibraryIds) || mcDraftDirty,
    onClose: () => {
      isLibraryModalOpen = false;
      resetMcDraft(null);
    },
  });

  /** Loads `group` into the draft for editing, or clears it for a new group. */
  function resetMcDraft(group: McGroupDraft | null) {
    editingMcGroupId = group?.id ?? null;
    mcStagingIds = [...(group?.memberIds ?? [])];
    mcDraftTitle = group?.title ?? DEFAULT_MC_GROUP_TITLE;
    mcDraftScoring = group?.scoringText ?? DEFAULT_MC_GROUP_SCORING_TEXT;
  }

  function setGroupVariant(groupId: string, vKey: string) {
    activeVariantPerGroup = { ...activeVariantPerGroup, [groupId]: vKey };
  }

  /** Loads the library and opens the dialog with the exam's standalone exercises ticked. */
  export async function open() {
    if (!editingMcGroupId) resetMcDraft(null);
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
      libraryClose.cancel();
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
    const group = mcGroups.find((g) => g.id === groupId);
    if (!group) return;
    resetMcDraft(group);
    open();
  }

  function toggleMcStaging(id: string) {
    mcStagingIds = toggleStaged(mcStagingIds, id, mcGroupMembership);
  }

  function reorderMcStaging(index: number, direction: "up" | "down") {
    mcStagingIds = moveStaged(mcStagingIds, index, direction);
  }

  /** Commits the MC draft to `mcGroups` without saving; false when there was nothing to commit. The scoring stays for the next group. */
  function stageGroup(): boolean {
    const committed = commitStagedGroup(mcGroups, {
      editingId: editingMcGroupId,
      staged: mcStagingIds,
      title: mcDraftTitle,
      scoringText: mcDraftScoring,
    });
    if (!committed) return false;
    mcGroups = committed.groups;
    adoptGroupMembers(committed.memberIds, committed.previousMemberIds);
    const scoring = mcDraftScoring;
    resetMcDraft(null);
    mcDraftScoring = scoring;
    return true;
  }

  async function finalizeMcGroup() {
    if (stageGroup()) await onSaveLinks();
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

  /** Applies the standalone selection and, if questions are still staged, their group too, in one save (#175). */
  async function applyLibrarySelection() {
    stageGroup();
    const groupedIds = new Set(mcGroups.flatMap((g) => g.memberIds));
    const standalone = selectedLibraryIds
      .filter((id) => !groupedIds.has(id))
      .map((id) => libraryExercises.find((ex) => ex.id === id))
      .filter((ex): ex is ExerciseRecord => Boolean(ex))
      .map((ex, idx) => ({ ...ex, orderIndex: idx + 1 }));
    const groupMembers = exercises.filter((ex) => groupedIds.has(ex.id));

    exercises = [...standalone, ...groupMembers];
    await onSaveLinks();
    libraryClose.force();
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
  bind:mcDraftTitle
  bind:mcDraftScoring
  {mcGroupPending}
  {editingMcGroup}
  {mcGroupMembership}
  onToggleMcStaging={toggleMcStaging}
  onReorderMcStaging={reorderMcStaging}
  onFinalizeMcGroup={finalizeMcGroup}
  onToggleSelection={toggleLibrarySelection}
  onSetGroupVariant={setGroupVariant}
  onApply={applyLibrarySelection}
  onRequestClose={libraryClose.request}
  {onQuickEdit}
  {onNewExercise}
/>

<ConfirmDialog
  open={libraryClose.confirming}
  title={$t("exam.page.library.discardTitle")}
  message={$t("exam.page.library.discardMessage")}
  confirmText={$t("exam.page.metadata.discardConfirm")}
  cancelText={$t("exam.page.metadata.discardKeepEditing")}
  severity="danger"
  role="dialog"
  onConfirm={libraryClose.force}
  onCancel={libraryClose.cancel}
/>
