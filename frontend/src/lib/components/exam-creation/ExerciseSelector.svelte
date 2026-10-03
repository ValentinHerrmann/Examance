<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import ExerciseLibraryPicker from "$lib/components/exercise-library/ExerciseLibraryPicker.svelte";
  import ExercisePreviewDrawer from "$lib/components/exercise-library/ExercisePreviewDrawer.svelte";
  import CustomExerciseForm from "$lib/components/exam-creation/CustomExerciseForm.svelte";
  import McGroupStagingPanel from "$lib/components/exam/McGroupStagingPanel.svelte";
  import type { McGroupDraft } from "$lib/exam/mcGroupStaging";
  import { t } from "$lib/i18n";

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

  export let activeTab: "library" | "mc" | "custom";
  export let selectedLibraryIds: string[];

  // MC group staging
  export let mcStagingIds: string[] = [];
  export let libraryExercises: ExerciseRecord[] = [];
  /** exerciseId → title of the group it already belongs to (excluding the one being edited). */
  export let mcGroupMembership: Record<string, string> = {};
  /** The group being edited, or null when building a new one. */
  export let editingMcGroup: McGroupDraft | null = null;
  export let onToggleMcStaging: (id: string) => void = () => {};
  export let onReorderMcStaging: (index: number, direction: "up" | "down") => void = () => {};
  export let onFinalizeMcGroup: (title: string, scoringText: string) => void = () => {};

  $: mcStagingExercises = mcStagingIds
    .map((id) => libraryExercises.find((e) => e.id === id))
    .filter((e): e is ExerciseRecord => Boolean(e));

  // Editing a group happens in the MC tab.
  $: if (editingMcGroup) activeTab = "mc";

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

  const tabBtn =
    "flex-[1_1_180px] cursor-pointer rounded-md border px-4 py-2 font-semibold sm:flex-none";
  const tabBtnIdle = `${tabBtn} border-line bg-surface-base text-muted hover:text-content`;
  const tabBtnActive = `${tabBtn} border-accent bg-primary text-primary-contrast`;

</script>

<div class="mb-6 min-w-0 rounded-xl border border-line bg-surface-raised p-4 sm:p-6">
  <div class="mb-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
    <h3 class="m-0 text-lg text-content">{$t("examCreation.exerciseSelector.heading")}</h3>
    <div class="flex flex-wrap gap-2">
      <button type="button" class={activeTab === "library" ? tabBtnActive : tabBtnIdle} on:click={() => (activeTab = "library")}>
        {$t("examCreation.exerciseSelector.tabLibrary", { count: selectedLibraryIds.length })}
      </button>
      <button type="button" class={activeTab === "mc" ? tabBtnActive : tabBtnIdle} on:click={() => (activeTab = "mc")}>
        {$t("examCreation.exerciseSelector.tabMc")}
      </button>
      <button type="button" class={activeTab === "custom" ? tabBtnActive : tabBtnIdle} on:click={() => (activeTab = "custom")}>
        {$t("examCreation.exerciseSelector.tabCustom")}
      </button>
    </div>
  </div>

  {#if activeTab === "custom"}
    <CustomExerciseForm
      bind:customName
      bind:customTopicTag
      bind:customLatexBody
      bind:saveCustomToLibrary
      {onAddCustomExercise}
    />
  {:else}
    <div class="flex min-w-0 flex-col gap-4 {activeTab === 'mc' ? 'lg:flex-row lg:items-start' : ''}">
      <div class="min-w-0 flex-1">
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
          typeFilter={activeTab === "mc" ? "mc" : "normal"}
          {activeVariantPerGroup}
          {selectedLibraryIds}
          {mcStagingIds}
          {mcGroupMembership}
          {onToggleSelection}
          {onToggleMcStaging}
          {onSetGroupVariant}
          {onQuickEdit}
          onOpenPreview={openPreviewModal}
        />
      </div>

      {#if activeTab === "mc"}
        <div class="min-w-0 lg:flex-[0_0_clamp(320px,34%,440px)]">
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
