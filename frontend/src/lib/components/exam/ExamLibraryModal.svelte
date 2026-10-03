<script lang="ts">
  import type { ExerciseRecord } from '$lib/db/schema';
  import ExerciseLibraryPicker from '$lib/components/exercise-library/ExerciseLibraryPicker.svelte';
  import ExercisePreviewDrawer from '$lib/components/exercise-library/ExercisePreviewDrawer.svelte';
  import McGroupStagingPanel from '$lib/components/exam/McGroupStagingPanel.svelte';
  import type { McGroupDraft } from '$lib/exam/mcGroupStaging';
  import { t } from '$lib/i18n';
  import { Modal, Button } from '$lib/components/ui';

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

  export let isOpen: boolean = false;
  export let filteredGroups: ExerciseGroup[];
  export let totalVariantsCount: number = 0;
  export let availableGrades: string[] = [];
  export let availableSubjects: string[] = [];
  export let availableTopics: string[] = [];
  export let librarySearch: string = "";
  export let selectedGradeFilter: string = "ALL";
  export let selectedSubjectFilter: string = "ALL";
  export let selectedTopicFilter: string = "ALL";
  export let selectedLibraryIds: string[];
  export let activeVariantPerGroup: Record<string, string>;
  export let libraryExercises: ExerciseRecord[] = [];

  // MC Group staging props
  export let mcStagingIds: string[] = [];
  /** The group being edited (prefills title/scoring), or null for a new group. */
  export let editingMcGroup: McGroupDraft | null = null;
  /** exerciseId → title of the group it already belongs to (excluding the one being edited). */
  export let mcGroupMembership: Record<string, string> = {};
  export let onToggleMcStaging: (id: string) => void = () => {};
  export let onReorderMcStaging: (index: number, direction: "up" | "down") => void = () => {};
  export let onFinalizeMcGroup: (title: string, scoringText: string) => void = () => {};

  export let onToggleSelection: (id: string) => void;
  export let onSetGroupVariant: (groupId: string, vKey: string) => void;
  export let onQuickEdit: ((ex: ExerciseRecord) => void) | undefined = undefined;
  export let onApply: () => void;
  export let onRequestClose: () => void;

  let activeTab: "normal" | "mc" = "normal";

  $: if (editingMcGroup) {
    activeTab = "mc";
  }

  $: mcStagingExercises = mcStagingIds
    .map((id) => libraryExercises.find((e) => e.id === id))
    .filter((e): e is ExerciseRecord => Boolean(e));

  // Preview drawer
  let isPreviewModalOpen = false;
  let previewModalEx: ExerciseRecord | null = null;

  function openPreviewModal(ex: ExerciseRecord) {
    previewModalEx = ex;
    isPreviewModalOpen = true;
  }

  function closePreviewModal() {
    isPreviewModalOpen = false;
    previewModalEx = null;
  }

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
          {availableTopics}
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
            onRemove={onToggleMcStaging}
            onReorder={onReorderMcStaging}
            onFinalize={onFinalizeMcGroup}
          />
        </div>
      {/if}
    </div>
  </div>

  <svelte:fragment slot="footer">
    <Button variant="outlined" severity="secondary" onClick={onRequestClose}>{$t("common.cancel")}</Button>
    <Button onClick={onApply}>{$t("exam.libraryModal.applyButton")}</Button>
  </svelte:fragment>
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
