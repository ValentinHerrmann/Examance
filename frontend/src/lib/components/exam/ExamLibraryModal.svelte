<script lang="ts">
  import "./ExamLibraryModal.css";
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
    class="elm-modal-backdrop"
    role="button"
    tabindex="-1"
    on:click|self={onRequestClose}
    on:keydown|self={(e) => e.key === 'Escape' && onRequestClose()}
  >
    <div class="elm-modal-content">
      <div class="elm-modal-header">
        <h3>Link Exercises from Library</h3>
        <button class="elm-close-btn" on:click={onRequestClose}>✕</button>
      </div>

      <div class="elm-modal-body">
        <input
          type="text"
          class="elm-search-input"
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

      <div class="elm-modal-footer">
        <button class="elm-cancel-btn" on:click={onRequestClose}>Cancel</button>
        <button class="elm-save-btn" on:click={onApply}>Apply Linked Exercises</button>
      </div>
    </div>
  </div>
{/if}
