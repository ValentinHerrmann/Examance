<script lang="ts">
  import "./ExerciseSelector.css";
  import type { ExerciseRecord } from "$lib/db/schema";
  import ExerciseLibraryPicker from "$lib/components/exercise-library/ExerciseLibraryPicker.svelte";
  import ExercisePreviewDrawer from "$lib/components/exercise-library/ExercisePreviewDrawer.svelte";
  import CustomExerciseForm from "$lib/components/exam-creation/CustomExerciseForm.svelte";

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

  export let activeTab: "library" | "custom";
  export let selectedLibraryIds: string[];

  // Library picker data & filters
  export let filteredGroups: ExerciseGroup[];
  export let totalVariantsCount: number;
  export let availableGrades: string[];
  export let availableSubjects: string[];
  export let availableTopics: string[];
  export let searchQuery: string;
  export let selectedGradeFilter: string;
  export let selectedSubjectFilter: string;
  export let selectedTopicFilter: string;
  export let activeVariantPerGroup: Record<string, string>;

  // Custom exercise form state
  export let customName: string;
  export let customTopicTag: string;
  export let customLatexBody: string;
  export let saveCustomToLibrary: boolean;

  // Callbacks (route-owned functions)
  export let onToggleSelection: (id: string) => void;
  export let onSetGroupVariant: (groupId: string, vKey: string) => void;
  export let onQuickEdit: (ex: ExerciseRecord) => void;
  export let onAddCustomExercise: () => void;

  // Preview drawer state (local to selector)
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

  function handleDrawerQuickEdit(ex: ExerciseRecord) {
    closePreviewModal();
    onQuickEdit(ex);
  }
</script>

<div class="exercise-selector-card">
  <div class="exercise-selector-header">
    <h3>2. Select Exercises</h3>
    <div class="exercise-selector-tabs">
      <button
        type="button"
        class="exercise-selector-tab-btn"
        class:active={activeTab === "library"}
        on:click={() => (activeTab = "library")}
      >
        📚 From Library ({selectedLibraryIds.length} Selected)
      </button>
      <button
        type="button"
        class="exercise-selector-tab-btn"
        class:active={activeTab === "custom"}
        on:click={() => (activeTab = "custom")}
      >
        ✏️ Create Custom Exercise
      </button>
    </div>
  </div>

  {#if activeTab === "library"}
    <ExerciseLibraryPicker
      {filteredGroups}
      {totalVariantsCount}
      {availableGrades}
      {availableSubjects}
      {availableTopics}
      bind:searchQuery
      bind:selectedGradeFilter
      bind:selectedSubjectFilter
      bind:selectedTopicFilter
      {activeVariantPerGroup}
      {selectedLibraryIds}
      {onToggleSelection}
      {onSetGroupVariant}
      {onQuickEdit}
      onOpenPreview={openPreviewModal}
    />
  {:else}
    <CustomExerciseForm
      bind:customName
      bind:customTopicTag
      bind:customLatexBody
      bind:saveCustomToLibrary
      {onAddCustomExercise}
    />
  {/if}
</div>

{#if isPreviewModalOpen && previewModalEx}
  <ExercisePreviewDrawer
    previewModalEx={previewModalEx}
    isModalSelected={selectedLibraryIds.includes(previewModalEx.id)}
    onClose={closePreviewModal}
    onToggleSelection={onToggleSelection}
    onQuickEdit={handleDrawerQuickEdit}
  />
{/if}
