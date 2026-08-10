<script lang="ts">
  import "./ExamLibraryModal.css";
  import type { ExerciseRecord } from '$lib/db/schema';
  import ExerciseLibraryPicker from '$lib/components/exercise-library/ExerciseLibraryPicker.svelte';
  import ExercisePreviewDrawer from '$lib/components/exercise-library/ExercisePreviewDrawer.svelte';

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
  export let editingMcGroupId: string | null = null;
  export let onToggleMcStaging: (id: string) => void = () => {};
  export let onReorderMcStaging: ((index: number, direction: "up" | "down") => void) | undefined = undefined;
  export let onFinalizeMcGroup: (title: string, scoringText: string) => void = () => {};

  export let onToggleSelection: (id: string) => void;
  export let onSetGroupVariant: (groupId: string, vKey: string) => void;
  export let onQuickEdit: ((ex: ExerciseRecord) => void) | undefined = undefined;
  export let onApply: () => void;
  export let onRequestClose: () => void;

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

{#if isOpen}
  <div
    class="elm-modal-backdrop"
    role="button"
    tabindex="-1"
    on:click|self={onRequestClose}
    on:keydown|self={(e) => e.key === 'Escape' && onRequestClose()}
  >
    <div class="elm-modal-content" style="max-width: 900px; width: 95%;">
      <div class="elm-modal-header">
        <h3>Link Exercises from Library</h3>
        <button class="elm-close-btn" on:click={onRequestClose}>✕</button>
      </div>

      <div class="elm-modal-body">
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
          {activeVariantPerGroup}
          {selectedLibraryIds}
          {mcStagingIds}
          {onToggleSelection}
          {onToggleMcStaging}
          {onSetGroupVariant}
          onQuickEdit={onQuickEdit || (() => {})}
          onOpenPreview={openPreviewModal}
        />

        {#if mcStagingExercises.length > 0}
          <div class="elm-mc-staging-box">
            <h4 class="elm-mc-staging-header">
              {editingMcGroupId ? "Edit MC Group" : "MC Group Staging Area"} ({mcStagingExercises.length} sub-exercises)
            </h4>
            <ul class="elm-mc-staging-list">
              {#each mcStagingExercises as ex, i}
                <li class="elm-mc-staging-item">
                  <span>{String.fromCharCode(97 + i)}) {ex.name || "Untitled"}</span>
                  <div style="display: flex; gap: 0.375rem; align-items: center;">
                    {#if onReorderMcStaging}
                      <button
                        type="button"
                        style="background: none; border: none; color: #94a3b8; cursor: pointer; padding: 0 4px;"
                        disabled={i === 0}
                        on:click={() => onReorderMcStaging && onReorderMcStaging(i, "up")}
                        title="Move up"
                      >↑</button>
                      <button
                        type="button"
                        style="background: none; border: none; color: #94a3b8; cursor: pointer; padding: 0 4px;"
                        disabled={i === mcStagingExercises.length - 1}
                        on:click={() => onReorderMcStaging && onReorderMcStaging(i, "down")}
                        title="Move down"
                      >↓</button>
                    {/if}
                    <button type="button" style="background: none; border: none; color: #f87171; cursor: pointer;" on:click={() => onToggleMcStaging(ex.id)}>Remove</button>
                  </div>
                </li>
              {/each}
            </ul>
            <div class="elm-mc-staging-form">
              <div>
                <label class="elm-mc-staging-label" for="mc-group-title-modal">MC Group Title</label>
                <input id="mc-group-title-modal" type="text" bind:value={mcStagingTitle} class="elm-mc-staging-input" />
              </div>
              <div>
                <label class="elm-mc-staging-label" for="mc-group-scoring-modal">Scoring Scheme</label>
                <textarea id="mc-group-scoring-modal" bind:value={mcStagingScoringText} rows="2" class="elm-mc-staging-textarea"></textarea>
              </div>
              <button
                type="button"
                class="elm-mc-staging-btn"
                disabled={mcStagingExercises.length < 1 || mcStagingExercises.length > 4}
                on:click={handleFinalizeMcGroup}
              >
                {editingMcGroupId ? "Update MC Group" : "Add MC Group to Exam"} ({mcStagingExercises.length} sub-exercises)
              </button>
              {#if mcStagingExercises.length < 1}
                <span style="font-size: 0.75rem; color: #64748b;">Select 1 to 4 sub-exercises to form a group.</span>
              {:else if mcStagingExercises.length > 4}
                <span style="font-size: 0.75rem; color: #fbbf24;">Maximum 4 sub-exercises allowed per MC group.</span>
              {/if}
            </div>
          </div>
        {/if}
      </div>

      <div class="elm-modal-footer">
        <button class="elm-cancel-btn" on:click={onRequestClose}>Cancel</button>
        <button class="elm-save-btn" on:click={onApply}>Apply Linked Exercises</button>
      </div>
    </div>
  </div>
{/if}

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
