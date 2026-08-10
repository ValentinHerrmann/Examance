<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import { parseExerciseScore } from "$lib/latex/scoreParser";

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
    "cursor-pointer rounded-xl border border-slate-700 bg-slate-900 px-[0.6rem] py-1 text-[0.8rem] text-slate-300";
  const pillActive =
    "cursor-pointer rounded-xl border border-slate-700 bg-sky-600 px-[0.6rem] py-1 text-[0.8rem] text-white";

  const variantPillBase =
    "inline-flex cursor-pointer items-center gap-1 rounded border border-slate-700 bg-slate-800 px-[0.455rem] py-[0.1rem] text-[0.72rem] font-medium text-slate-400 transition-all duration-150 ease-[ease] hover:border-sky-400 hover:text-slate-50";
  const variantPillHasSelected =
    "inline-flex cursor-pointer items-center gap-1 rounded border border-emerald-500 bg-slate-800 px-[0.455rem] py-[0.1rem] text-[0.72rem] font-medium text-slate-400 transition-all duration-150 ease-[ease] hover:text-slate-50";
  const variantPillActive =
    "inline-flex cursor-pointer items-center gap-1 rounded border border-sky-400 bg-sky-600 px-[0.455rem] py-[0.1rem] text-[0.72rem] font-semibold text-white transition-all duration-150 ease-[ease]";
  const variantPillActiveHasSelected =
    "inline-flex cursor-pointer items-center gap-1 rounded border border-emerald-400 bg-emerald-600 px-[0.455rem] py-[0.1rem] text-[0.72rem] font-semibold text-white transition-all duration-150 ease-[ease]";

  function variantPillClass(active: boolean, hasSelected: boolean): string {
    if (active && hasSelected) return variantPillActiveHasSelected;
    if (active) return variantPillActive;
    if (hasSelected) return variantPillHasSelected;
    return variantPillBase;
  }

  const rowBase =
    "flex items-start gap-[0.85rem] rounded-[10px] border border-slate-700 bg-slate-800 p-[0.85rem_1rem] transition-colors duration-150 ease-[ease] hover:border-slate-600 hover:bg-[#223044] max-[900px]:flex-wrap";
  const rowSelected =
    "flex items-start gap-[0.85rem] rounded-[10px] border border-sky-600 bg-sky-600/10 p-[0.85rem_1rem] transition-colors duration-150 ease-[ease] max-[900px]:flex-wrap";
  $: displayedGroups = selectedTopicFilter === "ALL"
    ? filteredGroups
    : filteredGroups.filter((g) => g.topicTag === selectedTopicFilter);
</script>

<div class="flex flex-col gap-3 mb-4">
  <div class="flex flex-wrap items-center justify-between gap-4 max-[900px]:items-stretch">
    <input
      type="text"
      placeholder="Search exercise library by name, topic, grade, subject, variant, or LaTeX content..."
      bind:value={searchQuery}
      class="w-full box-border flex-[1_1_280px] rounded-md border border-slate-700 bg-slate-900 p-[0.625rem] text-white"
    />
    <span class="whitespace-nowrap text-[0.8rem] font-medium text-slate-400 max-[900px]:whitespace-normal">
      {displayedGroups.length} Exercise Groups ({totalVariantsCount} Variants)
    </span>
  </div>

  <div class="flex flex-wrap items-center gap-x-4 gap-y-3 max-[900px]:flex-col max-[900px]:items-stretch">
    {#if availableGrades.length > 0}
      <div class="flex min-w-0 flex-[0_1_240px] items-center gap-2 text-sm text-slate-300 max-[900px]:w-full max-[900px]:flex-auto">
        <label for="picker-grade">Grade:</label>
        <select id="picker-grade" bind:value={selectedGradeFilter} class="w-full min-w-0 rounded-md border border-slate-700 bg-slate-800 px-3 py-[0.375rem] text-[0.85rem] text-white focus:border-sky-400 focus:shadow-[0_0_0_1px_rgba(56,189,248,0.25)] focus:outline-none">
          <option value="ALL">All Grades</option>
          {#each availableGrades as g}
            <option value={g}>Grade {g}</option>
          {/each}
        </select>
      </div>
    {/if}

    {#if availableSubjects.length > 0}
      <div class="flex min-w-0 flex-[0_1_240px] items-center gap-2 text-sm text-slate-300 max-[900px]:w-full max-[900px]:flex-auto">
        <label for="picker-subject">Subject:</label>
        <select id="picker-subject" bind:value={selectedSubjectFilter} class="w-full min-w-0 rounded-md border border-slate-700 bg-slate-800 px-3 py-[0.375rem] text-[0.85rem] text-white focus:border-sky-400 focus:shadow-[0_0_0_1px_rgba(56,189,248,0.25)] focus:outline-none">
          <option value="ALL">All Subjects</option>
          {#each availableSubjects as s}
            <option value={s}>{s}</option>
          {/each}
        </select>
      </div>
    {/if}
  </div>

  <div class="flex flex-wrap gap-[0.4rem]">
    <button
      type="button"
      class={selectedTopicFilter === "ALL" ? pillActive : pillBase}
      on:click={() => (selectedTopicFilter = "ALL")}
    >
      All ({filteredGroups.length})
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
  <div class="p-6 text-center text-[0.9rem] text-slate-400">
    No exercise groups found in library matching filter criteria.
  </div>
{:else}
  <div class="flex max-h-[min(58vh,620px)] flex-col gap-3 overflow-y-auto pr-2 max-[900px]:max-h-[min(64vh,720px)]">
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
              title={isMc ? (isSelected ? "Remove from MC staging area" : mcStagingIds.length >= 4 ? "Max 4 sub-questions per MC group reached" : "Add to MC staging area") : (isSelected ? "Remove from exam" : "Add to exam")}
              class="h-4 w-4 cursor-pointer accent-sky-600 disabled:opacity-40 disabled:cursor-not-allowed"
            />
          {/if}
        </div>

        <!-- Main Info: Title, Topic, Variants -->
        <div class="flex min-w-0 flex-1 flex-col gap-[0.45rem]">
          <div class="flex flex-wrap items-start gap-[0.6rem]">
            <span class="overflow-hidden text-ellipsis whitespace-nowrap text-[0.98rem] font-semibold text-slate-50 max-[640px]:whitespace-normal [@media(max-height:760px)_and_(orientation:landscape)]:whitespace-normal">{group.name}</span>

            {#if group.topicTag}
              <span class="rounded px-[0.45rem] py-[0.1rem] text-[0.72rem] font-medium bg-slate-700 text-slate-300">{group.topicTag}</span>
            {/if}

            {#if isMc}
              <span class="rounded border border-amber-500 bg-amber-500/15 px-[0.4rem] py-[0.05rem] text-[0.72rem] font-semibold text-amber-400">
                MC
              </span>
            {/if}

            {#if groupSelectedCount > 0}
              <span class="rounded border border-emerald-500 bg-emerald-500/15 px-[0.4rem] py-[0.05rem] text-[0.72rem] font-semibold text-emerald-400">
                ✓ {groupSelectedCount} {isMc ? "staged" : "in exam"}
              </span>
            {/if}
          </div>

          <!-- Inline Variant Selector Pills (if multiple variants exist) -->
          {#if group.variants.size > 1}
            <div class="flex flex-wrap items-center gap-[0.35rem] max-[640px]:w-full [@media(max-height:760px)_and_(orientation:landscape)]:w-full">
              {#each group.variants.keys() as vKey}
                {@const members = group.variants.get(vKey) || []}
                {@const hasSelected = members.some(m => selectedLibraryIds.includes(m.ex.id))}
                <button
                  type="button"
                  class={variantPillClass(vKey === activeVKey, hasSelected)}
                  on:click={() => onSetGroupVariant(group.groupId, vKey)}
                  title={`Switch to variant "${vKey}"`}
                >
                  {#if hasSelected}
                    <span class="text-[0.7rem] font-bold text-emerald-400">✓</span>
                  {/if}
                  <span>{vKey}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Right Actions: Points, Quick Edit & Preview Button -->
        <div class="ml-auto flex flex-wrap items-start justify-end gap-2 whitespace-nowrap max-[900px]:w-full max-[900px]:ml-0 max-[900px]:flex-wrap max-[900px]:justify-start">
          <span class="rounded bg-sky-700 px-2 py-[0.15rem] text-xs font-semibold text-sky-100">
            {group.variants.size > 1 && group.minPoints !== group.maxPoints
              ? `${group.minPoints}-${group.maxPoints} Pkt`
              : `${score} Pkt`}
          </span>

          {#if activeEx}
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded border border-slate-600 bg-slate-700 px-2 py-1 text-xs font-medium text-slate-100 transition-all duration-150 ease-[ease] hover:border-sky-400 hover:bg-slate-600 hover:text-sky-400"
              title="Quick Edit Exercise Globally"
              on:click={() => onQuickEdit(activeEx)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              <span>Quick Edit</span>
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded border border-slate-700 bg-transparent px-2 py-1 text-xs font-medium text-sky-400 transition-all duration-150 ease-[ease] hover:border-sky-400 hover:bg-slate-800"
              title="Quick Preview LaTeX Code"
              on:click={() => onOpenPreview(activeEx)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              <span>Preview</span>
            </button>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}

