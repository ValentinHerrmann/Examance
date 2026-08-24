<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import { parseExerciseScore } from "$lib/latex/scoreParser";
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

  export let filteredGroups: ExerciseGroup[];
  export let totalVariantsCount: number;
  export let availableGrades: string[];
  export let availableSubjects: string[];
  export let availableTopics: string[];
  export let searchQuery: string;
  export let selectedGradeFilter: string;
  export let selectedSubjectFilter: string;
  export let selectedTopicFilter: string;
  export let typeFilter: "normal" | "mc" = "normal";
  export let activeVariantPerGroup: Record<string, string>;
  export let selectedLibraryIds: string[];
  export let mcStagingIds: string[] = [];
  export let onToggleSelection: (id: string) => void;
  export let onToggleMcStaging: (id: string) => void = () => {};
  export let onSetGroupVariant: (groupId: string, vKey: string) => void;
  export let onQuickEdit: (ex: ExerciseRecord) => void;
  export let onOpenPreview: (ex: ExerciseRecord) => void;

  function isMcType(ex: ExerciseRecord): boolean {
    return ex.questionType === "mc" || ex.questionType === "sc";
  }

  const pillBase =
    "cursor-pointer rounded-xl border border-line bg-surface-base px-2.5 py-1 text-sm text-muted";
  const pillActive =
    "cursor-pointer rounded-xl border border-line bg-accent-strong px-2.5 py-1 text-sm text-white";

  const variantPillBase =
    "inline-flex cursor-pointer items-center gap-1 rounded border border-line bg-surface-raised px-2 py-0.5 text-xs font-medium text-muted transition-all duration-150 ease-[ease] hover:border-accent hover:text-content";
  const variantPillHasSelected =
    "inline-flex cursor-pointer items-center gap-1 rounded border border-emerald-500 bg-surface-raised px-2 py-0.5 text-xs font-medium text-muted transition-all duration-150 ease-[ease] hover:text-content";
  const variantPillActive =
    "inline-flex cursor-pointer items-center gap-1 rounded border border-accent bg-accent-strong px-2 py-0.5 text-xs font-semibold text-white transition-all duration-150 ease-[ease]";
  const variantPillActiveHasSelected =
    "inline-flex cursor-pointer items-center gap-1 rounded border border-emerald-400 bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white transition-all duration-150 ease-[ease]";

  function variantPillClass(active: boolean, hasSelected: boolean): string {
    if (active && hasSelected) return variantPillActiveHasSelected;
    if (active) return variantPillActive;
    if (hasSelected) return variantPillHasSelected;
    return variantPillBase;
  }

  const rowBase =
    "flex flex-wrap items-start gap-3 rounded-[10px] border border-line bg-surface-raised px-4 py-3 transition-colors duration-150 ease-[ease] hover:border-line-strong hover:bg-[#223044] lg:flex-nowrap";
  const rowSelected =
    "flex flex-wrap items-start gap-3 rounded-[10px] border border-accent-strong bg-accent-strong/10 px-4 py-3 transition-colors duration-150 ease-[ease] lg:flex-nowrap";
  $: displayedGroups = filteredGroups.filter((g) => {
    if (selectedTopicFilter !== "ALL" && g.topicTag !== selectedTopicFilter) return false;
    const activeVKey = activeVariantPerGroup[g.groupId] || Array.from(g.variants.keys())[0] || "_General";
    const vMembers = g.variants.get(activeVKey) || [];
    const activeEx = vMembers[0]?.ex;
    if (!activeEx) return false;
    const isMc = isMcType(activeEx);
    return typeFilter === "mc" ? isMc : !isMc;
  });
</script>

<div class="flex flex-col gap-3 mb-4">
  <div class="flex flex-wrap items-stretch justify-between gap-4 lg:items-center">
    <input
      type="text"
      placeholder={$t("exercises.libraryPicker.searchPlaceholder")}
      bind:value={searchQuery}
      class="w-full box-border flex-[1_1_280px] rounded-md border border-line bg-surface-base p-2.5 text-white"
    />
    <span class="whitespace-normal text-sm font-medium text-muted lg:whitespace-nowrap">
      {$t("exercises.libraryPicker.groupsSummary", { groups: displayedGroups.length, variants: totalVariantsCount })}
    </span>
  </div>

  <div class="flex flex-col flex-wrap items-stretch gap-x-4 gap-y-3 lg:flex-row lg:items-center">
    {#if availableGrades.length > 0}
      <div class="flex min-w-0 w-full flex-auto items-center gap-2 text-sm text-muted lg:w-auto lg:flex-[0_1_240px]">
        <label for="picker-grade">{$t("exercises.libraryPicker.gradeLabel")}</label>
        <select id="picker-grade" bind:value={selectedGradeFilter} class="w-full min-w-0 rounded-md border border-line bg-surface-raised px-3 py-1.5 text-sm text-white focus:border-accent focus:shadow-[0_0_0_1px_rgba(56,189,248,0.25)] focus:outline-none">
          <option value="ALL">{$t("exercises.libraryPicker.allGrades")}</option>
          {#each availableGrades as g}
            <option value={g}>{$t("exercises.libraryPicker.gradeOption", { grade: g })}</option>
          {/each}
        </select>
      </div>
    {/if}

    {#if availableSubjects.length > 0}
      <div class="flex min-w-0 w-full flex-auto items-center gap-2 text-sm text-muted lg:w-auto lg:flex-[0_1_240px]">
        <label for="picker-subject">{$t("exercises.libraryPicker.subjectLabel")}</label>
        <select id="picker-subject" bind:value={selectedSubjectFilter} class="w-full min-w-0 rounded-md border border-line bg-surface-raised px-3 py-1.5 text-sm text-white focus:border-accent focus:shadow-[0_0_0_1px_rgba(56,189,248,0.25)] focus:outline-none">
          <option value="ALL">{$t("exercises.libraryPicker.allSubjects")}</option>
          {#each availableSubjects as s}
            <option value={s}>{s}</option>
          {/each}
        </select>
      </div>
    {/if}
  </div>

  <div class="flex flex-wrap gap-1.5">
    <button
      type="button"
      class={selectedTopicFilter === "ALL" ? pillActive : pillBase}
      on:click={() => (selectedTopicFilter = "ALL")}
    >
      {$t("exercises.libraryPicker.allTopics", { count: filteredGroups.length })}
    </button>
    {#each availableTopics as topic}
      {@const groupCount = filteredGroups.filter((g) => g.topicTag === topic).length}
      <button
        type="button"
        class={selectedTopicFilter === topic ? pillActive : pillBase}
        on:click={() => (selectedTopicFilter = topic)}
      >
        {topic} ({groupCount})
      </button>
    {/each}
  </div>
</div>

{#if displayedGroups.length === 0}
  <div class="p-6 text-center text-sm text-muted">
    {$t("exercises.libraryPicker.empty")}
  </div>
{:else}
  <div class="flex max-h-[min(64dvh,720px)] flex-col gap-3 overflow-y-auto pr-2 lg:max-h-[min(58dvh,620px)]">
    {#each displayedGroups as group}
      {@const activeVKey = activeVariantPerGroup[group.groupId] || Array.from(group.variants.keys())[0] || "_General"}
      {@const vMembers = group.variants.get(activeVKey) || []}
      {@const activeMember = vMembers[0]}
      {@const activeEx = activeMember?.ex}
      {@const isMc = activeEx ? isMcType(activeEx) : false}
      {@const isSelected = activeEx ? (isMc ? mcStagingIds.includes(activeEx.id) : selectedLibraryIds.includes(activeEx.id)) : false}
      {@const groupSelectedCount = group.allMembers.filter(m => selectedLibraryIds.includes(m.ex.id) || mcStagingIds.includes(m.ex.id)).length}
      {@const score = activeEx ? (parseExerciseScore(activeEx.latexBody || "") || activeEx.maxPoints || 0) : 0}

      <div class={groupSelectedCount > 0 ? rowSelected : rowBase}>
        <!-- Selection Checkbox -->
        <div class="flex items-center">
          {#if activeEx}
            <input
              type="checkbox"
              checked={isSelected}
              disabled={isMc && !isSelected && mcStagingIds.length >= 4}
              on:change={() => (isMc ? onToggleMcStaging(activeEx.id) : onToggleSelection(activeEx.id))}
              title={isMc ? (isSelected ? $t("exercises.libraryPicker.checkboxRemoveMcStaging") : mcStagingIds.length >= 4 ? $t("exercises.libraryPicker.checkboxMaxMcReached") : $t("exercises.libraryPicker.checkboxAddMcStaging")) : (isSelected ? $t("exercises.libraryPicker.checkboxRemoveFromExam") : $t("exercises.libraryPicker.checkboxAddToExam"))}
              class="h-4 w-4 cursor-pointer accent-accent-strong disabled:opacity-40 disabled:cursor-not-allowed"
            />
          {/if}
        </div>

        <!-- Main Info: Title, Topic, Variants -->
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <div class="flex flex-wrap items-start gap-2.5">
            <span class="min-w-0 overflow-hidden text-ellipsis whitespace-normal text-base font-semibold text-content sm:whitespace-nowrap">{group.name}</span>

            {#if group.topicTag}
              <span class="rounded px-2 py-0.5 text-xs font-medium bg-surface-inset text-muted">{group.topicTag}</span>
            {/if}

            {#if isMc}
              <span class="rounded border border-amber-500 bg-amber-500/15 px-1.5 py-0.5 text-xs font-semibold text-amber-400">
                MC
              </span>
            {/if}

            {#if groupSelectedCount > 0}
              <span class="rounded border border-emerald-500 bg-emerald-500/15 px-1.5 py-0.5 text-xs font-semibold text-emerald-400">
                ✓ {isMc ? $t("exercises.libraryPicker.stagedCount", { count: groupSelectedCount }) : $t("exercises.libraryPicker.inExamCount", { count: groupSelectedCount })}
              </span>
            {/if}
          </div>

          <!-- Inline Variant Selector Pills (if multiple variants exist) -->
          {#if group.variants.size > 1}
            <div class="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
              {#each group.variants.keys() as vKey}
                {@const members = group.variants.get(vKey) || []}
                {@const hasSelected = members.some(m => selectedLibraryIds.includes(m.ex.id))}
                <button
                  type="button"
                  class={variantPillClass(vKey === activeVKey, hasSelected)}
                  on:click={() => onSetGroupVariant(group.groupId, vKey)}
                  title={$t("exercises.libraryPicker.switchVariantTitle", { key: vKey })}
                >
                  {#if hasSelected}
                    <span class="text-xs font-bold text-emerald-400">✓</span>
                  {/if}
                  <span>{vKey}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Right Actions: Points, Quick Edit & Preview Button -->
        <div class="flex w-full flex-wrap items-start justify-start gap-2 whitespace-nowrap ml-0 lg:ml-auto lg:w-auto lg:justify-end">
          <span class="rounded bg-accent-strong px-2 py-0.5 text-xs font-semibold text-content">
            {group.variants.size > 1 && group.minPoints !== group.maxPoints
              ? $t("exercises.libraryPicker.pointsRange", { min: group.minPoints, max: group.maxPoints })
              : $t("exercises.libraryPicker.pointsSingle", { score })}
          </span>

          {#if activeEx}
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded border border-line-strong bg-surface-inset px-2 py-1 text-xs font-medium text-content transition-all duration-150 ease-[ease] hover:border-accent hover:bg-line-strong hover:text-accent"
              title={$t("exercises.libraryPicker.quickEditTitle")}
              on:click={() => onQuickEdit(activeEx)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              <span>{$t("exercises.libraryPicker.quickEditText")}</span>
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded border border-line bg-transparent px-2 py-1 text-xs font-medium text-accent transition-all duration-150 ease-[ease] hover:border-accent hover:bg-surface-raised"
              title={$t("exercises.libraryPicker.quickPreviewTitle")}
              on:click={() => onOpenPreview(activeEx)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              <span>{$t("common.preview")}</span>
            </button>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}

