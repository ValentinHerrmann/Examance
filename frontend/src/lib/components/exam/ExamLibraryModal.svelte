<script lang="ts">
  import { faPlus } from "@fortawesome/free-solid-svg-icons";
  import { untrack } from "svelte";
  import { type ExerciseGroup } from "#lib/exercise-library/groupExercises";
  import type { ExerciseRecord } from '#lib/db/schema';
  import ExerciseLibraryPicker from '#lib/components/exercise-library/ExerciseLibraryPicker.svelte';
  import ExercisePreviewDrawer from '#lib/components/exercise-library/ExercisePreviewDrawer.svelte';
  import McGroupStagingPanel from '#lib/components/exam/McGroupStagingPanel.svelte';
  import type { McGroupDraft } from '#lib/exam/mcGroupStaging';
  import { t } from '#lib/i18n';
  import { Modal, Button } from '#lib/components/ui';

  interface Props {
    isOpen?: boolean;
    filteredGroups: ExerciseGroup[];
    totalVariantsCount?: number;
    availableGrades?: string[];
    availableSubjects?: string[];
    librarySearch?: string;
    selectedGradeFilter?: string;
    selectedSubjectFilter?: string;
    selectedTopicFilter?: string;
    selectedLibraryIds: string[];
    activeVariantPerGroup: Record<string, string>;
    libraryExercises?: ExerciseRecord[];
    // MC Group staging props
    mcStagingIds?: string[];
    /** Draft group title and scoring, owned by the caller. */
    mcDraftTitle?: string;
    mcDraftScoring?: string;
    /** The footer's apply also commits an MC group (#175). */
    mcGroupPending?: boolean;
    /** The group being edited (prefills title/scoring), or null for a new group. */
    editingMcGroup?: McGroupDraft | null;
    /** exerciseId → title of the group it already belongs to (excluding the one being edited). */
    mcGroupMembership?: Record<string, string>;
    onToggleMcStaging?: (id: string) => void;
    onReorderMcStaging?: (index: number, direction: "up" | "down") => void;
    onFinalizeMcGroup?: () => void;
    onToggleSelection: (id: string) => void;
    onSetGroupVariant: (groupId: string, vKey: string) => void;
    onQuickEdit?: ((ex: ExerciseRecord) => void) | undefined;
    /** Write a new exercise right here (M1); the caller selects it once saved. */
    onNewExercise?: () => void;
    onApply: () => void;
    onRequestClose: () => void;
  }

  let {
    isOpen = false,
    filteredGroups,
    totalVariantsCount = 0,
    availableGrades = [],
    availableSubjects = [],
    librarySearch = $bindable(""),
    selectedGradeFilter = $bindable("ALL"),
    selectedSubjectFilter = $bindable("ALL"),
    selectedTopicFilter = $bindable("ALL"),
    selectedLibraryIds,
    activeVariantPerGroup,
    libraryExercises = [],
    mcStagingIds = [],
    mcDraftTitle = $bindable(""),
    mcDraftScoring = $bindable(""),
    mcGroupPending = false,
    editingMcGroup = null,
    mcGroupMembership = {},
    onToggleMcStaging = () => {},
    onReorderMcStaging = () => {},
    onFinalizeMcGroup = () => {},
    onToggleSelection,
    onSetGroupVariant,
    onQuickEdit = undefined,
    onNewExercise = undefined,
    onApply,
    onRequestClose
  }: Props = $props();

  let activeTab: "normal" | "mc" = $state("normal");

  let mcStagingExercises = $derived(mcStagingIds
    .map((id) => libraryExercises.find((e) => e.id === id))
    .filter((e): e is ExerciseRecord => Boolean(e)));

  // Preview drawer
  let isPreviewModalOpen = $state(false);
  let previewModalEx: ExerciseRecord | null = $state.raw(null);

  function openPreviewModal(ex: ExerciseRecord) {
    previewModalEx = ex;
    isPreviewModalOpen = true;
  }

  function closePreviewModal() {
    isPreviewModalOpen = false;
    previewModalEx = null;
  }

  $effect.pre(() => {
    const group = editingMcGroup;
    if (group) {
      untrack(() => (activeTab = "mc"));
    }
  });
</script>

<Modal open={isOpen} size="large" title={$t("exam.libraryModal.header")} onClose={onRequestClose}>
  <div class="flex flex-col gap-4">
    <div class="flex gap-2 border-b border-line pb-3">
      <Button
        size="sm"
        variant="outlined"
        severity="secondary"
        pressed={activeTab === 'normal'}
        disabled={Boolean(editingMcGroup)}
        title={editingMcGroup ? $t("exam.libraryModal.finishEditingFirst") : $t("exam.libraryModal.showNormalExercises")}
        onClick={() => (activeTab = 'normal')}
      >
        {$t("exam.libraryModal.normalTab")}
      </Button>
      <Button
        size="sm"
        variant="outlined"
        severity="secondary"
        pressed={activeTab === 'mc'}
        onClick={() => (activeTab = 'mc')}
      >
        {$t("exam.libraryModal.mcTab")}
      </Button>
    </div>

    <div
      class="flex min-h-0 flex-1 flex-col gap-4 {activeTab === 'mc' ? '@3xl:flex-row @3xl:items-stretch' : ''}"
    >
      <div class="flex min-h-0 min-w-0 flex-1 flex-col {activeTab === 'mc' ? '@3xl:flex-[1_1_62%]' : ''}">
        <ExerciseLibraryPicker
          {filteredGroups}
          {totalVariantsCount}
          {availableGrades}
          {availableSubjects}
          bind:searchQuery={librarySearch}
          bind:selectedGradeFilter
          bind:selectedSubjectFilter
          bind:selectedTopicFilter
          typeFilter={activeTab}
          {activeVariantPerGroup}
          {selectedLibraryIds}
          {mcStagingIds}
          {mcGroupMembership}
          {onToggleSelection}
          {onToggleMcStaging}
          {onSetGroupVariant}
          onQuickEdit={onQuickEdit || (() => {})}
          onOpenPreview={openPreviewModal}
        />
      </div>

      {#if activeTab === 'mc'}
        <div class="max-h-[45dvh] min-w-0 flex-shrink-0 overflow-y-auto @3xl:max-h-none @3xl:flex-[0_0_clamp(340px,34%,460px)]">
          <McGroupStagingPanel
            stagedExercises={mcStagingExercises}
            editingGroup={editingMcGroup}
            bind:title={mcDraftTitle}
            bind:scoringText={mcDraftScoring}
            onRemove={onToggleMcStaging}
            onReorder={onReorderMcStaging}
            onFinalize={onFinalizeMcGroup}
            onOpenExercise={onQuickEdit}
          />
        </div>
      {/if}
    </div>
  </div>

  {#snippet footer()}
    {#if onNewExercise}
      <Button variant="outlined" icon={faPlus} class="mr-auto" onClick={onNewExercise}>{$t("exam.libraryModal.newExercise")}</Button>
    {/if}
    <Button variant="outlined" severity="secondary" onClick={onRequestClose}>{$t("common.cancel")}</Button>
    <Button onClick={onApply}>
      {mcGroupPending ? $t("exam.libraryModal.applyWithGroupButton") : $t("exam.libraryModal.applyButton")}
    </Button>
  {/snippet}
</Modal>

{#if isPreviewModalOpen && previewModalEx}
  <ExercisePreviewDrawer
    previewModalEx={previewModalEx}
    isModalSelected={selectedLibraryIds.includes(previewModalEx.id)}
    onClose={closePreviewModal}
    onToggleSelection={(id) => onToggleSelection(id)}
    onQuickEdit={(ex) => {
      closePreviewModal();
      if (onQuickEdit) onQuickEdit(ex);
    }}
  />
{/if}
