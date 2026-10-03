<script lang="ts">
  import { untrack } from "svelte";
  import { type ExerciseGroup } from "$lib/exercise-library/groupExercises";
  import type { ExerciseRecord } from "$lib/db/schema";
  import ExerciseLibraryPicker from "$lib/components/exercise-library/ExerciseLibraryPicker.svelte";
  import ExercisePreviewDrawer from "$lib/components/exercise-library/ExercisePreviewDrawer.svelte";
  import CustomExerciseForm from "$lib/components/exam-creation/CustomExerciseForm.svelte";
  import McGroupStagingPanel from "$lib/components/exam/McGroupStagingPanel.svelte";
  import type { McGroupDraft } from "$lib/exam/mcGroupStaging";
  import { t } from "$lib/i18n";
  import { Button, Card } from "$lib/components/ui";

  interface Props {
    activeTab: "library" | "mc" | "custom";
    selectedLibraryIds: string[];
    // MC group staging
    mcStagingIds?: string[];
    libraryExercises?: ExerciseRecord[];
    /** exerciseId → title of the group it already belongs to (excluding the one being edited). */
    mcGroupMembership?: Record<string, string>;
    /** The group being edited, or null when building a new one. */
    editingMcGroup?: McGroupDraft | null;
    onToggleMcStaging?: (id: string) => void;
    onReorderMcStaging?: (index: number, direction: "up" | "down") => void;
    onFinalizeMcGroup?: (title: string, scoringText: string) => void;
    // Library picker data & filters
    filteredGroups: ExerciseGroup[];
    totalVariantsCount: number;
    availableGrades: string[];
    availableSubjects: string[];
    availableTopics: string[];
    searchQuery: string;
    selectedGradeFilter: string;
    selectedSubjectFilter: string;
    selectedTopicFilter: string;
    activeVariantPerGroup: Record<string, string>;
    // Custom exercise form state
    customName: string;
    customTopicTag: string;
    customLatexBody: string;
    saveCustomToLibrary: boolean;
    // Callbacks (route-owned functions)
    onToggleSelection: (id: string) => void;
    onSetGroupVariant: (groupId: string, vKey: string) => void;
    onQuickEdit: (ex: ExerciseRecord) => void;
    onAddCustomExercise: () => void;
  }

  let {
    activeTab = $bindable(),
    selectedLibraryIds,
    mcStagingIds = [],
    libraryExercises = [],
    mcGroupMembership = {},
    editingMcGroup = null,
    onToggleMcStaging = () => {},
    onReorderMcStaging = () => {},
    onFinalizeMcGroup = () => {},
    filteredGroups,
    totalVariantsCount,
    availableGrades,
    availableSubjects,
    availableTopics,
    searchQuery = $bindable(),
    selectedGradeFilter = $bindable(),
    selectedSubjectFilter = $bindable(),
    selectedTopicFilter = $bindable(),
    activeVariantPerGroup,
    customName = $bindable(),
    customTopicTag = $bindable(),
    customLatexBody = $bindable(),
    saveCustomToLibrary = $bindable(),
    onToggleSelection,
    onSetGroupVariant,
    onQuickEdit,
    onAddCustomExercise
  }: Props = $props();

  // Preview drawer state (local to selector)
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

  function handleDrawerQuickEdit(ex: ExerciseRecord) {
    closePreviewModal();
    onQuickEdit(ex);
  }

  let mcStagingExercises = $derived(mcStagingIds
    .map((id) => libraryExercises.find((e) => e.id === id))
    .filter((e): e is ExerciseRecord => Boolean(e)));
  // Editing a group happens in the MC tab.
  $effect.pre(() => {
    const group = editingMcGroup;
    if (group) untrack(() => (activeTab = "mc"));
  });
</script>

<Card class="mb-6">
  <div class="mb-4 flex flex-col gap-4 @3xl:flex-row @3xl:flex-wrap @3xl:items-center @3xl:justify-between">
    <h2 class="m-0 min-w-0 text-xl font-medium text-content">{$t("examCreation.exerciseSelector.heading")}</h2>
    <div class="flex flex-wrap gap-2">
      <Button variant="outlined" severity="secondary" pressed={activeTab === "library"} onClick={() => (activeTab = "library")}>
        {$t("examCreation.exerciseSelector.tabLibrary", { count: selectedLibraryIds.length })}
      </Button>
      <Button variant="outlined" severity="secondary" pressed={activeTab === "mc"} onClick={() => (activeTab = "mc")}>
        {$t("examCreation.exerciseSelector.tabMc")}
      </Button>
      <Button variant="outlined" severity="secondary" pressed={activeTab === "custom"} onClick={() => (activeTab = "custom")}>
        {$t("examCreation.exerciseSelector.tabCustom")}
      </Button>
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
    <div class="flex min-w-0 flex-col gap-4 {activeTab === 'mc' ? '@3xl:flex-row @3xl:items-start' : ''}">
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
        <div class="min-w-0 @3xl:flex-[0_0_clamp(320px,34%,440px)]">
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
</Card>

{#if isPreviewModalOpen && previewModalEx}
  <ExercisePreviewDrawer
    previewModalEx={previewModalEx}
    isModalSelected={selectedLibraryIds.includes(previewModalEx.id)}
    onClose={closePreviewModal}
    onToggleSelection={onToggleSelection}
    onQuickEdit={handleDrawerQuickEdit}
  />
{/if}
