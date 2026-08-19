<script lang="ts">
  import "./ExamLibraryModal.css";
  import type { ExerciseRecord } from '$lib/db/schema';
  import ExerciseLibraryPicker from '$lib/components/exercise-library/ExerciseLibraryPicker.svelte';
  import ExercisePreviewDrawer from '$lib/components/exercise-library/ExercisePreviewDrawer.svelte';
  import LatexEditor from '$lib/components/LatexEditor.svelte';
  import { t } from '$lib/i18n';

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

  let activeTab: "normal" | "mc" = "normal";

  $: if (editingMcGroupId) {
    activeTab = "mc";
  }

  let mcStagingTitle = "Grundlagen";
  // MC scoring rubric sentence — exam CONTENT that flows verbatim into the compiled LaTeX/PDF.
  // Stays German by design (see i18n brief "Do NOT translate"), not a UI string.
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
    <div class="elm-modal-content">
      <div class="elm-modal-header">
        <h3>{$t("exam.libraryModal.header")}</h3>
        <button class="elm-close-btn" on:click={onRequestClose}>✕</button>
      </div>

      <div class="elm-modal-body">
        <div class="elm-tab-bar">
          <button
            type="button"
            class="elm-tab-btn"
            class:active={activeTab === 'normal'}
            disabled={Boolean(editingMcGroupId)}
            title={editingMcGroupId ? $t("exam.libraryModal.finishEditingFirst") : $t("exam.libraryModal.showNormalExercises")}
            on:click={() => (activeTab = 'normal')}
          >
            {$t("exam.libraryModal.normalTab")}
          </button>
          <button
            type="button"
            class="elm-tab-btn"
            class:active={activeTab === 'mc'}
            on:click={() => (activeTab = 'mc')}
          >
            {$t("exam.libraryModal.mcTab")}
          </button>
        </div>

        <div
          class="elm-modal-columns"
          class:elm-modal-columns--split={activeTab === 'mc' && mcStagingExercises.length > 0}
        >
          <div class="elm-col-list">
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
              {onToggleSelection}
              {onToggleMcStaging}
              {onSetGroupVariant}
              onQuickEdit={onQuickEdit || (() => {})}
              onOpenPreview={openPreviewModal}
            />
          </div>

        {#if activeTab === 'mc' && mcStagingExercises.length > 0}
          <div class="elm-mc-staging-box">
            <h4 class="elm-mc-staging-header">
              {editingMcGroupId ? $t("exam.libraryModal.stagingHeaderEdit") : $t("exam.libraryModal.stagingHeaderNew")} {$t("exam.libraryModal.subExercisesCount", { count: mcStagingExercises.length })}
            </h4>
            <ul class="elm-mc-staging-list">
              {#each mcStagingExercises as ex, i}
                <li class="elm-mc-staging-item">
                  <span>{String.fromCharCode(97 + i)}) {ex.name || $t("exam.page.library.untitled")}</span>
                  <div style="display: flex; gap: 0.375rem; align-items: center;">
                    {#if onReorderMcStaging}
                      <button
                        type="button"
                        style="background: none; border: none; color: #94a3b8; cursor: pointer; padding: 0 4px;"
                        disabled={i === 0}
                        on:click={() => onReorderMcStaging && onReorderMcStaging(i, "up")}
                        title={$t("exam.libraryModal.moveUp")}
                      >↑</button>
                      <button
                        type="button"
                        style="background: none; border: none; color: #94a3b8; cursor: pointer; padding: 0 4px;"
                        disabled={i === mcStagingExercises.length - 1}
                        on:click={() => onReorderMcStaging && onReorderMcStaging(i, "down")}
                        title={$t("exam.libraryModal.moveDown")}
                      >↓</button>
                    {/if}
                    <button type="button" style="background: none; border: none; color: #f87171; cursor: pointer;" on:click={() => onToggleMcStaging(ex.id)}>{$t("exam.libraryModal.remove")}</button>
                  </div>
                </li>
              {/each}
            </ul>
            <div class="elm-mc-staging-form">
              <div>
                <label class="elm-mc-staging-label" for="mc-group-title-modal">{$t("exam.libraryModal.groupTitleLabel")}</label>
                <input id="mc-group-title-modal" type="text" bind:value={mcStagingTitle} class="elm-mc-staging-input" />
              </div>
              <div>
                <label class="elm-mc-staging-label">{$t("exam.libraryModal.scoringSchemeLabel")}</label>
                <div class="elm-mc-staging-editor-wrap">
                  <LatexEditor bind:value={mcStagingScoringText} rows={3} />
                </div>
              </div>
              <button
                type="button"
                class="elm-mc-staging-btn"
                disabled={mcStagingExercises.length < 1 || mcStagingExercises.length > 4}
                on:click={handleFinalizeMcGroup}
              >
                {editingMcGroupId ? $t("exam.libraryModal.updateGroupButton") : $t("exam.libraryModal.addGroupButton")} {$t("exam.libraryModal.subExercisesCount", { count: mcStagingExercises.length })}
              </button>
              {#if mcStagingExercises.length < 1}
                <span style="font-size: 0.75rem; color: #64748b;">{$t("exam.libraryModal.selectHint")}</span>
              {:else if mcStagingExercises.length > 4}
                <span style="font-size: 0.75rem; color: #fbbf24;">{$t("exam.libraryModal.maxHint")}</span>
              {/if}
            </div>
          </div>
        {/if}
        </div>
      </div>

      <div class="elm-modal-footer">
        <button class="elm-cancel-btn" on:click={onRequestClose}>{$t("common.cancel")}</button>
        <button class="elm-save-btn" on:click={onApply}>{$t("exam.libraryModal.applyButton")}</button>
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
