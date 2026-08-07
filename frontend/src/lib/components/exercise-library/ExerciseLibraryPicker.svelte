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
  export let onToggleSelection: (id: string) => void;
  export let onSetGroupVariant: (groupId: string, vKey: string) => void;
  export let onQuickEdit: (ex: ExerciseRecord) => void;
  export let onOpenPreview: (ex: ExerciseRecord) => void;
</script>

<div class="filter-row">
  <div class="search-metrics-row">
    <input
      type="text"
      placeholder="Search exercise library by name, topic, grade, subject, variant, or LaTeX content..."
      bind:value={searchQuery}
      class="search-input"
    />
    <span class="library-metrics">
      {filteredGroups.length} Exercise Groups ({totalVariantsCount} Variants)
    </span>
  </div>

  <div class="filter-selects-row">
    {#if availableGrades.length > 0}
      <div class="select-group">
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
      <div class="select-group">
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

  <div class="topic-pills">
    <button
      type="button"
      class="pill"
      class:active={selectedTopicFilter === "ALL"}
      on:click={() => (selectedTopicFilter = "ALL")}
    >
      All ({filteredGroups.length})
    </button>
    {#each availableTopics as topic}
      {@const groupCount = filteredGroups.filter((g) => g.topicTag === topic).length}
      <button
        type="button"
        class="pill"
        class:active={selectedTopicFilter === topic}
        on:click={() => (selectedTopicFilter = topic)}
      >
        {topic} ({groupCount})
      </button>
    {/each}
  </div>
</div>

{#if filteredGroups.length === 0}
  <div class="empty-hint">
    No exercise groups found in library matching filter criteria.
  </div>
{:else}
  <div class="compact-exercise-list">
    {#each filteredGroups as group}
      {@const activeVKey = activeVariantPerGroup[group.groupId] || Array.from(group.variants.keys())[0] || "_General"}
      {@const vMembers = group.variants.get(activeVKey) || []}
      {@const activeMember = vMembers[0]}
      {@const activeEx = activeMember?.ex}
      {@const isSelected = activeEx ? selectedLibraryIds.includes(activeEx.id) : false}
      {@const groupSelectedCount = group.allMembers.filter(m => selectedLibraryIds.includes(m.ex.id)).length}
      {@const score = activeEx ? (parseExerciseScore(activeEx.latexBody || "") || activeEx.maxPoints || 0) : 0}

      <div class="compact-group-row" class:row-selected={groupSelectedCount > 0}>
        <!-- Selection Checkbox -->
        <div class="row-checkbox-col">
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
        <div class="row-main-col">
          <div class="row-title-line">
            <span class="group-title-text">{group.name}</span>

            {#if group.topicTag}
              <span class="compact-topic-tag">{group.topicTag}</span>
            {/if}

            {#if groupSelectedCount > 0}
              <span class="selected-indicator-badge">
                ✓ {groupSelectedCount} in exam
              </span>
            {/if}
          </div>

          <!-- Inline Variant Selector Pills (if multiple variants exist) -->
          {#if group.variants.size > 1}
            <div class="compact-variant-bar">
              {#each group.variants.keys() as vKey}
                {@const members = group.variants.get(vKey) || []}
                {@const hasSelected = members.some(m => selectedLibraryIds.includes(m.ex.id))}
                <button
                  type="button"
                  class="compact-variant-pill"
                  class:active={vKey === activeVKey}
                  class:has-selected={hasSelected}
                  on:click={() => onSetGroupVariant(group.groupId, vKey)}
                  title={`Switch to variant "${vKey}"`}
                >
                  {#if hasSelected}
                    <span class="v-check">✓</span>
                  {/if}
                  <span>{vKey}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Right Actions: Points, Quick Edit & Preview Button -->
        <div class="row-actions-col">
          <span class="compact-score-badge">
            {group.variants.size > 1 && group.minPoints !== group.maxPoints
              ? `${group.minPoints}-${group.maxPoints} Pkt`
              : `${score} Pkt`}
          </span>

          {#if activeEx}
            <button
              type="button"
              class="icon-edit-btn"
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
              class="icon-preview-btn"
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

<style>
  .filter-row {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .search-input {
    width: 100%;
    box-sizing: border-box;
    flex: 1 1 280px;
    padding: 0.625rem;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: white;
  }

  .search-metrics-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .filter-selects-row {
    display: flex;
    gap: 0.75rem 1rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .select-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #cbd5e1;
    font-size: 0.875rem;
    flex: 0 1 240px;
    min-width: 0;
  }

  .select-group select {
    background: #1e293b;
    border: 1px solid #334155;
    color: white;
    padding: 0.375rem 0.75rem;
    border-radius: 6px;
    font-size: 0.85rem;
    min-width: 0;
    width: 100%;
  }

  .select-group select:focus {
    outline: none;
    border-color: #38bdf8;
    box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.25);
  }

  .topic-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .pill {
    background: #0f172a;
    border: 1px solid #334155;
    color: #cbd5e1;
    padding: 0.25rem 0.6rem;
    border-radius: 12px;
    cursor: pointer;
    font-size: 0.8rem;
  }

  .pill.active {
    background: #0284c7;
    color: white;
  }

  .empty-hint {
    color: #94a3b8;
    text-align: center;
    padding: 1.5rem;
    font-size: 0.9rem;
  }

  .library-metrics {
    font-size: 0.8rem;
    color: #94a3b8;
    white-space: nowrap;
    font-weight: 500;
  }

  .compact-exercise-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-height: min(58vh, 620px);
    overflow-y: auto;
    padding-right: 0.5rem;
  }

  .compact-group-row {
    display: flex;
    align-items: flex-start;
    gap: 0.85rem;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 10px;
    padding: 0.85rem 1rem;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .compact-group-row:hover {
    border-color: #475569;
    background: #223044;
  }

  .compact-group-row.row-selected {
    border-color: #0284c7;
    background: rgba(2, 132, 199, 0.1);
  }

  .row-checkbox-col {
    display: flex;
    align-items: center;
  }

  .row-checkbox-col input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: #0284c7;
  }

  .row-main-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    min-width: 0;
  }

  .row-title-line {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .group-title-text {
    font-weight: 600;
    color: #f8fafc;
    font-size: 0.98rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .compact-topic-tag {
    font-size: 0.72rem;
    background: #334155;
    color: #cbd5e1;
    padding: 0.1rem 0.45rem;
    border-radius: 4px;
    font-weight: 500;
  }

  .selected-indicator-badge {
    font-size: 0.72rem;
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid #10b981;
    color: #34d399;
    padding: 0.05rem 0.4rem;
    border-radius: 4px;
    font-weight: 600;
  }

  .compact-variant-bar {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex-wrap: wrap;
  }

  .compact-variant-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: #1e293b;
    border: 1px solid #334155;
    color: #94a3b8;
    padding: 0.1rem 0.455rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.72rem;
    font-weight: 500;
    transition: all 0.15s ease;
  }

  .compact-variant-pill:hover {
    border-color: #38bdf8;
    color: #f8fafc;
  }

  .compact-variant-pill.active {
    background: #0284c7;
    border-color: #38bdf8;
    color: white;
    font-weight: 600;
  }

  .compact-variant-pill.has-selected {
    border-color: #10b981;
  }

  .compact-variant-pill.active.has-selected {
    background: #059669;
    border-color: #34d399;
  }

  .v-check {
    color: #34d399;
    font-weight: bold;
    font-size: 0.7rem;
  }

  .row-actions-col {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    white-space: nowrap;
    flex-wrap: wrap;
    justify-content: flex-end;
    margin-left: auto;
  }

  .compact-score-badge {
    background: #0369a1;
    color: #e0f2fe;
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    font-weight: 600;
  }

  .icon-preview-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: transparent;
    border: 1px solid #334155;
    color: #38bdf8;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.15s ease;
  }

  .icon-preview-btn:hover {
    background: #1e293b;
    border-color: #38bdf8;
  }

  .icon-edit-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: #334155;
    border: 1px solid #475569;
    color: #f1f5f9;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.15s ease;
  }

  .icon-edit-btn:hover {
    background: #475569;
    border-color: #38bdf8;
    color: #38bdf8;
  }

  @media (max-width: 900px) {
    .search-metrics-row {
      align-items: stretch;
    }

    .library-metrics {
      white-space: normal;
    }

    .filter-selects-row {
      flex-direction: column;
      align-items: stretch;
    }

    .select-group {
      width: 100%;
      flex: 1 1 auto;
    }

    .compact-exercise-list {
      max-height: min(64vh, 720px);
    }

    .compact-group-row {
      flex-wrap: wrap;
      align-items: flex-start;
    }

    .row-actions-col {
      width: 100%;
      margin-left: 0;
      flex-wrap: wrap;
      justify-content: flex-start;
    }
  }

  @media (max-width: 640px), (max-height: 760px) and (orientation: landscape) {
    .group-title-text {
      white-space: normal;
    }

    .compact-variant-bar {
      width: 100%;
    }
  }
</style>
