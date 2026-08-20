<script lang="ts">
  import type { ExerciseRecord } from '$lib/db/schema';
  import ExerciseLibraryPicker from '$lib/components/exercise-library/ExerciseLibraryPicker.svelte';
  import ExercisePreviewDrawer from '$lib/components/exercise-library/ExercisePreviewDrawer.svelte';
  import LatexEditor from '$lib/components/LatexEditor.svelte';
  import { t } from '$lib/i18n';
  import { Modal, Button, TextInput } from '$lib/components/ui';

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

  const tabBtnBase =
    "cursor-pointer rounded-md border border-line bg-transparent px-[0.9rem] py-[0.4rem] text-[0.85rem] font-medium text-muted transition-all duration-150 ease-[ease] hover:enabled:bg-surface-inset hover:enabled:text-content disabled:cursor-not-allowed disabled:opacity-40";
  const tabBtnActive =
    "cursor-pointer rounded-md border border-accent bg-accent-strong px-[0.9rem] py-[0.4rem] text-[0.85rem] font-semibold text-white";
</script>

<Modal open={isOpen} size="lg" title={$t("exam.libraryModal.header")} onClose={onRequestClose}>
  <div class="flex flex-col gap-4">
    <div class="flex gap-2 border-b border-line pb-3">
      <button
        type="button"
        class={activeTab === 'normal' ? tabBtnActive : tabBtnBase}
        disabled={Boolean(editingMcGroupId)}
        title={editingMcGroupId ? $t("exam.libraryModal.finishEditingFirst") : $t("exam.libraryModal.showNormalExercises")}
        on:click={() => (activeTab = 'normal')}
      >
        {$t("exam.libraryModal.normalTab")}
      </button>
      <button
        type="button"
        class={activeTab === 'mc' ? tabBtnActive : tabBtnBase}
        on:click={() => (activeTab = 'mc')}
      >
        {$t("exam.libraryModal.mcTab")}
      </button>
    </div>

    <div
      class="flex min-h-0 flex-1 flex-col gap-4 {activeTab === 'mc' && mcStagingExercises.length > 0
        ? 'lg:flex-row lg:items-stretch'
        : ''}"
    >
      <div class="flex min-h-0 flex-1 flex-col {activeTab === 'mc' && mcStagingExercises.length > 0 ? 'lg:flex-[1_1_62%]' : ''}">
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
        <div class="flex max-h-[45vh] flex-shrink-0 flex-col gap-3 overflow-y-auto rounded-[10px] border border-amber-500/60 bg-amber-500/5 p-4 lg:max-h-none lg:flex-[0_0_clamp(340px,34%,460px)]">
          <h4 class="m-0 text-[0.9rem] font-semibold text-amber-400">
            {editingMcGroupId ? $t("exam.libraryModal.stagingHeaderEdit") : $t("exam.libraryModal.stagingHeaderNew")} {$t("exam.libraryModal.subExercisesCount", { count: mcStagingExercises.length })}
          </h4>
          <ul class="m-0 flex list-none flex-col gap-[0.35rem] p-0">
            {#each mcStagingExercises as ex, i}
              <li class="flex items-center justify-between gap-2 rounded-md border border-line bg-surface-base/60 px-[0.6rem] py-[0.35rem] text-[0.85rem] text-content/90">
                <span>{String.fromCharCode(97 + i)}) {ex.name || $t("exam.page.library.untitled")}</span>
                <div class="flex items-center gap-[0.375rem]">
                  {#if onReorderMcStaging}
                    <button
                      type="button"
                      class="cursor-pointer border-none bg-transparent px-1 text-muted disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={i === 0}
                      on:click={() => onReorderMcStaging && onReorderMcStaging(i, "up")}
                      title={$t("exam.libraryModal.moveUp")}
                    >↑</button>
                    <button
                      type="button"
                      class="cursor-pointer border-none bg-transparent px-1 text-muted disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={i === mcStagingExercises.length - 1}
                      on:click={() => onReorderMcStaging && onReorderMcStaging(i, "down")}
                      title={$t("exam.libraryModal.moveDown")}
                    >↓</button>
                  {/if}
                  <button type="button" class="cursor-pointer border-none bg-transparent text-red-400" on:click={() => onToggleMcStaging(ex.id)}>{$t("exam.libraryModal.remove")}</button>
                </div>
              </li>
            {/each}
          </ul>
          <div class="flex flex-col gap-[0.6rem]">
            <div>
              <label class="mb-[0.15rem] block text-xs font-medium text-muted" for="mc-group-title-modal">{$t("exam.libraryModal.groupTitleLabel")}</label>
              <TextInput id="mc-group-title-modal" bind:value={mcStagingTitle} />
            </div>
            <div>
              <label class="mb-[0.15rem] block text-xs font-medium text-muted">{$t("exam.libraryModal.scoringSchemeLabel")}</label>
              <LatexEditor bind:value={mcStagingScoringText} rows={3} />
            </div>
            <button
              type="button"
              class="cursor-pointer self-start rounded-md border border-amber-500 bg-amber-500/15 px-[0.85rem] py-[0.4rem] text-[0.85rem] font-semibold text-amber-300 transition-colors duration-150 ease-[ease] enabled:hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={mcStagingExercises.length < 1 || mcStagingExercises.length > 4}
              on:click={handleFinalizeMcGroup}
            >
              {editingMcGroupId ? $t("exam.libraryModal.updateGroupButton") : $t("exam.libraryModal.addGroupButton")} {$t("exam.libraryModal.subExercisesCount", { count: mcStagingExercises.length })}
            </button>
            {#if mcStagingExercises.length < 1}
              <span class="text-xs text-subtle">{$t("exam.libraryModal.selectHint")}</span>
            {:else if mcStagingExercises.length > 4}
              <span class="text-xs text-yellow-400">{$t("exam.libraryModal.maxHint")}</span>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>

  <svelte:fragment slot="footer">
    <Button variant="secondary" onClick={onRequestClose}>{$t("common.cancel")}</Button>
    <Button variant="primary" onClick={onApply}>{$t("exam.libraryModal.applyButton")}</Button>
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
