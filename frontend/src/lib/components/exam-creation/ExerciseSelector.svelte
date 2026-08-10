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

  // MC group staging
  export let mcStagingIds: string[] = [];
  export let libraryExercises: ExerciseRecord[] = [];
  export let onToggleMcStaging: (id: string) => void = () => {};
  export let onReorderMcStaging: ((index: number, direction: "up" | "down") => void) | undefined = undefined;
  export let onFinalizeMcGroup: (title: string, scoringText: string) => void = () => {};

  let mcStagingTitle = "Grundlagen";
  let mcStagingScoringText =
    "Für jedes korrekte Kreuz 1BE; für jedes falsche Kreuz -0,5BE. Pro Teilaufgabe aber immer $\\geq$0BE";

  $: mcStagingExercises = mcStagingIds
    .map((id) => libraryExercises.find((e) => e.id === id))
    .filter((e): e is ExerciseRecord => Boolean(e));

  function handleFinalizeMcGroup() {
    onFinalizeMcGroup(mcStagingTitle, mcStagingScoringText);
    mcStagingTitle = "Grundlagen";
  }

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
      {mcStagingIds}
      {onToggleSelection}
      {onToggleMcStaging}
      {onSetGroupVariant}
      {onQuickEdit}
      onOpenPreview={openPreviewModal}
    />

    {#if mcStagingExercises.length > 0}
      <div class="mt-4 rounded-[10px] border border-amber-500/60 bg-amber-500/5 p-4">
        <h4 class="mb-2 text-sm font-semibold text-amber-400">MC Group Staging Area ({mcStagingExercises.length} sub-exercises)</h4>
        <ul class="mb-3 flex flex-col gap-1">
          {#each mcStagingExercises as ex, i}
            <li class="flex items-center justify-between text-sm text-slate-300">
              <span>{String.fromCharCode(97 + i)}) {ex.name || "Untitled"}</span>
              <div class="flex items-center gap-1.5">
                {#if onReorderMcStaging}
                  <button
                    type="button"
                    class="px-1 text-xs text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400"
                    disabled={i === 0}
                    on:click={() => onReorderMcStaging && onReorderMcStaging(i, "up")}
                    title="Move up"
                  >↑</button>
                  <button
                    type="button"
                    class="px-1 text-xs text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400"
                    disabled={i === mcStagingExercises.length - 1}
                    on:click={() => onReorderMcStaging && onReorderMcStaging(i, "down")}
                    title="Move down"
                  >↓</button>
                {/if}
                <button type="button" class="text-xs text-red-400 hover:text-red-300 ml-1" on:click={() => onToggleMcStaging(ex.id)}>Remove</button>
              </div>
            </li>
          {/each}
        </ul>
        <div class="flex flex-col gap-2">
          <label class="text-xs text-slate-400" for="mc-group-title">MC Group Title</label>
          <input id="mc-group-title" type="text" bind:value={mcStagingTitle} class="rounded-md border border-slate-700 bg-slate-900 p-2 text-sm text-white" />
          <label class="text-xs text-slate-400" for="mc-group-scoring">Scoring Scheme</label>
          <textarea id="mc-group-scoring" bind:value={mcStagingScoringText} rows="2" class="rounded-md border border-slate-700 bg-slate-900 p-2 text-sm text-white"></textarea>
          <button
            type="button"
            class="mt-1 self-start rounded-md border border-amber-500 bg-amber-500/15 px-3 py-1.5 text-sm font-semibold text-amber-300 hover:bg-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={mcStagingExercises.length < 1 || mcStagingExercises.length > 4}
            on:click={handleFinalizeMcGroup}
          >
            Add MC Group to Exam ({mcStagingExercises.length} sub-exercises)
          </button>
          {#if mcStagingExercises.length < 1}
            <span class="text-xs text-slate-500">Select 1 to 4 sub-exercises to form a group.</span>
          {:else if mcStagingExercises.length > 4}
            <span class="text-xs text-amber-400">Maximum 4 sub-exercises allowed per MC group.</span>
          {/if}
        </div>
      </div>
    {/if}
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
