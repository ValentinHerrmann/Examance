<script lang="ts">
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

<div class="section-card">
  <div class="section-header">
    <h3>2. Select Exercises</h3>
    <div class="tabs">
      <button
        type="button"
        class="tab-btn"
        class:active={activeTab === "library"}
        on:click={() => (activeTab = "library")}
      >
        📚 From Library ({selectedLibraryIds.length} Selected)
      </button>
      <button
        type="button"
        class="tab-btn"
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

<style>
  .section-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 10px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .section-card h3 {
    margin-top: 0;
    color: #f8fafc;
    font-size: 1.1rem;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }

  .tabs {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .tab-btn {
    background: #0f172a;
    border: 1px solid #334155;
    color: #94a3b8;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 600;
  }

  .tab-btn.active {
    background: #0284c7;
    border-color: #38bdf8;
    color: white;
  }

  @media (max-width: 900px) {
    .section-header {
      align-items: stretch;
    }

    .tabs {
      width: 100%;
    }

    .tab-btn {
      flex: 1 1 220px;
    }
  }

  @media (max-width: 640px), (max-height: 760px) and (orientation: landscape) {
    .section-card {
      padding: 1rem;
    }
  }
</style>
