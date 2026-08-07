<script lang="ts">
  import type { ExerciseRecord } from '$lib/db/schema';
  import { parseExerciseScore } from '$lib/latex/scoreParser';

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
  export let selectedLibraryIds: string[];
  export let activeVariantPerGroup: Record<string, string>;
  export let librarySearch: string;
  export let onToggleSelection: (group: ExerciseGroup, vKey: string) => void;
  export let onSelectVariant: (group: ExerciseGroup, vKey: string) => void;
  export let onApply: () => void;
  export let onRequestClose: () => void;
</script>

{#if isOpen}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="-1"
    on:click|self={onRequestClose}
    on:keydown|self={(e) => e.key === 'Escape' && onRequestClose()}
  >
    <div class="modal-content">
      <div class="modal-header">
        <h3>Link Exercises from Library</h3>
        <button class="close-btn" on:click={onRequestClose}>✕</button>
      </div>

      <div class="modal-body">
        <input
          type="text"
          class="search-input"
          bind:value={librarySearch}
          placeholder="Search by name, topic, or content..."
        />

        <div class="library-picker-list">
          {#each filteredGroups as group}
            {@const activeVKey = activeVariantPerGroup[group.groupId] || Array.from(group.variants.keys())[0] || '_General'}
            {@const vMembers = group.variants.get(activeVKey) || []}
            {@const activeMember = vMembers[0]}
            {@const activeEx = activeMember?.ex}
            {@const isSelected = activeEx ? selectedLibraryIds.includes(activeEx.id) : false}
            {@const groupSelectedCount = group.allMembers.filter((m) => selectedLibraryIds.includes(m.ex.id)).length}
            {@const score = activeEx ? (parseExerciseScore(activeEx.latexBody || '') || activeEx.maxPoints || 0) : 0}

            <div class="compact-group-row" class:row-selected={groupSelectedCount > 0}>
              <div class="row-checkbox-col">
                {#if activeEx}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    on:change={() => onToggleSelection(group, activeVKey)}
                    title={isSelected ? 'Remove from exam' : 'Add to exam'}
                  />
                {/if}
              </div>

              <div class="row-main-col">
                <div class="row-title-line">
                  <strong class="group-title-text">{group.name}</strong>
                  {#if group.topicTag}
                    <span class="compact-topic-tag">{group.topicTag}</span>
                  {/if}
                  {#if groupSelectedCount > 0}
                    <span class="selected-indicator-badge">✓ {groupSelectedCount} in exam</span>
                  {/if}
                </div>

                {#if group.variants.size > 1}
                  <div class="compact-variant-bar">
                    {#each group.variants.keys() as vKey}
                      {@const members = group.variants.get(vKey) || []}
                      {@const hasSelected = members.some((m) => selectedLibraryIds.includes(m.ex.id))}
                      <button
                        type="button"
                        class="compact-variant-pill"
                        class:active={vKey === activeVKey}
                        class:has-selected={hasSelected}
                        on:click={() => onSelectVariant(group, vKey)}
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

              <div class="row-actions-col">
                <span class="compact-score-badge">
                  {group.variants.size > 1 && group.minPoints !== group.maxPoints
                    ? `${group.minPoints}-${group.maxPoints} Pkt`
                    : `${score} Pkt`}
                </span>
              </div>
            </div>
          {/each}
        </div>
      </div>

      <div class="modal-footer">
        <button class="cancel-btn" on:click={onRequestClose}>Cancel</button>
        <button class="save-btn" on:click={onApply}>Apply Linked Exercises</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal-content {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    width: min(96vw, 1080px);
    max-width: 1080px;
    max-height: 88vh;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid #334155;
  }

  .modal-header h3 {
    margin: 0;
    color: #38bdf8;
  }

  .close-btn {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 1.25rem;
    cursor: pointer;
  }

  .modal-body {
    padding: 1.5rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .search-input {
    background: #0f172a;
    border: 1px solid #334155;
    color: white;
    padding: 0.625rem 1rem;
    width: 100%;
    box-sizing: border-box;
  }

  .library-picker-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-height: min(64vh, 680px);
    overflow-y: auto;
  }

  .compact-group-row {
    display: flex;
    align-items: flex-start;
    gap: 0.85rem;
    background: #1e293b;
    padding: 0.85rem 1rem;
    border-radius: 10px;
    border: 1px solid #334155;
    cursor: pointer;
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
    flex-shrink: 0;
  }

  .row-checkbox-col input[type='checkbox'] {
    width: 16px;
    height: 16px;
    margin-top: 0.2rem;
    accent-color: #0284c7;
  }

  .row-main-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .row-title-line {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .group-title-text {
    color: #f8fafc;
    font-weight: 600;
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

  .row-actions-col {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    white-space: nowrap;
    flex-wrap: wrap;
    justify-content: flex-end;
    margin-left: auto;
    flex-shrink: 0;
  }

  .compact-score-badge {
    background: #0369a1;
    color: #e0f2fe;
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    font-weight: 600;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid #334155;
  }
</style>
