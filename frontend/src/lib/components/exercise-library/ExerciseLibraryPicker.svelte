<script lang="ts">
  import "./ExerciseLibraryPicker.css";
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
  export let onToggleSelection: (id: string) => void;
  export let onSetGroupVariant: (groupId: string, vKey: string) => void;
  export let onQuickEdit: (ex: ExerciseRecord) => void;
  export let onOpenPreview: (ex: ExerciseRecord) => void;
</script>

<div class="exercise-library-picker-filter-row">
  <div class="exercise-library-picker-search-metrics-row">
    <input
      type="text"
      placeholder="Search exercise library by name, topic, grade, subject, variant, or LaTeX content..."
      bind:value={searchQuery}
      class="exercise-library-picker-search-input"
    />
    <span class="exercise-library-picker-library-metrics">
      {filteredGroups.length} Exercise Groups ({totalVariantsCount} Variants)
    </span>
  </div>

  <div class="exercise-library-picker-filter-selects-row">
    {#if availableGrades.length > 0}
      <div class="exercise-library-picker-select-group">
        <label for="picker-grade">Grade:</label>
        <select id="picker-grade" bind:value={selectedGradeFilter}>
          <option value="ALL">All Grades</option>
          {#each availableGrades as g}
            <option value={g}>Grade {g}</option>
          {/each}
        </select>
      </div>
    {/if}

    {#if availableSubjects.length > 0}
      <div class="exercise-library-picker-select-group">
        <label for="picker-subject">Subject:</label>
        <select id="picker-subject" bind:value={selectedSubjectFilter}>
          <option value="ALL">All Subjects</option>
          {#each availableSubjects as s}
            <option value={s}>{s}</option>
          {/each}
        </select>
      </div>
    {/if}
  </div>

  <div class="exercise-library-picker-topic-pills">
    <button
      type="button"
      class="exercise-library-picker-pill"
      class:active={selectedTopicFilter === "ALL"}
      on:click={() => (selectedTopicFilter = "ALL")}
    >
      All ({filteredGroups.length})
    </button>
    {#each availableTopics as topic}
      {@const groupCount = filteredGroups.filter((g) => g.topicTag === topic).length}
      <button
        type="button"
        class="exercise-library-picker-pill"
        class:active={selectedTopicFilter === topic}
        on:click={() => (selectedTopicFilter = topic)}
      >
        {topic} ({groupCount})
      </button>
    {/each}
  </div>
</div>

{#if filteredGroups.length === 0}
  <div class="exercise-library-picker-empty-hint">
    No exercise groups found in library matching filter criteria.
  </div>
{:else}
  <div class="exercise-library-picker-compact-exercise-list">
    {#each filteredGroups as group}
      {@const activeVKey = activeVariantPerGroup[group.groupId] || Array.from(group.variants.keys())[0] || "_General"}
      {@const vMembers = group.variants.get(activeVKey) || []}
      {@const activeMember = vMembers[0]}
      {@const activeEx = activeMember?.ex}
      {@const isSelected = activeEx ? selectedLibraryIds.includes(activeEx.id) : false}
      {@const groupSelectedCount = group.allMembers.filter(m => selectedLibraryIds.includes(m.ex.id)).length}
      {@const score = activeEx ? (parseExerciseScore(activeEx.latexBody || "") || activeEx.maxPoints || 0) : 0}

      <div class="exercise-library-picker-compact-group-row" class:exercise-library-picker-row-selected={groupSelectedCount > 0}>
        <!-- Selection Checkbox -->
        <div class="exercise-library-picker-row-checkbox-col">
          {#if activeEx}
            <input
              type="checkbox"
              checked={isSelected}
              on:change={() => onToggleSelection(activeEx.id)}
              title={isSelected ? "Remove from exam" : "Add to exam"}
            />
          {/if}
        </div>

        <!-- Main Info: Title, Topic, Variants -->
        <div class="exercise-library-picker-row-main-col">
          <div class="exercise-library-picker-row-title-line">
            <span class="exercise-library-picker-group-title-text">{group.name}</span>

            {#if group.topicTag}
              <span class="exercise-library-picker-compact-topic-tag">{group.topicTag}</span>
            {/if}

            {#if groupSelectedCount > 0}
              <span class="exercise-library-picker-selected-indicator-badge">
                ✓ {groupSelectedCount} in exam
              </span>
            {/if}
          </div>

          <!-- Inline Variant Selector Pills (if multiple variants exist) -->
          {#if group.variants.size > 1}
            <div class="exercise-library-picker-compact-variant-bar">
              {#each group.variants.keys() as vKey}
                {@const members = group.variants.get(vKey) || []}
                {@const hasSelected = members.some(m => selectedLibraryIds.includes(m.ex.id))}
                <button
                  type="button"
                  class="exercise-library-picker-compact-variant-pill"
                  class:active={vKey === activeVKey}
                  class:has-selected={hasSelected}
                  on:click={() => onSetGroupVariant(group.groupId, vKey)}
                  title={`Switch to variant "${vKey}"`}
                >
                  {#if hasSelected}
                    <span class="exercise-library-picker-v-check">✓</span>
                  {/if}
                  <span>{vKey}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Right Actions: Points, Quick Edit & Preview Button -->
        <div class="exercise-library-picker-row-actions-col">
          <span class="exercise-library-picker-compact-score-badge">
            {group.variants.size > 1 && group.minPoints !== group.maxPoints
              ? `${group.minPoints}-${group.maxPoints} Pkt`
              : `${score} Pkt`}
          </span>

          {#if activeEx}
            <button
              type="button"
              class="exercise-library-picker-icon-edit-btn"
              title="Quick Edit Exercise Globally"
              on:click={() => onQuickEdit(activeEx)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
              <span class="preview-text">Quick Edit</span>
            </button>
            <button
              type="button"
              class="exercise-library-picker-icon-preview-btn"
              title="Quick Preview LaTeX Code"
              on:click={() => onOpenPreview(activeEx)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
              <span class="preview-text">Preview</span>
            </button>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}

