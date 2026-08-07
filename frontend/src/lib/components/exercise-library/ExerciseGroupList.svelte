<script lang="ts">
  import "./ExerciseGroupList.css";
  import type { ExerciseRecord } from "$lib/db/schema";
  import LatexViewer from "$lib/components/LatexViewer.svelte";
  import { getGroupRepresentative, type ExerciseGroup } from "./ExerciseGroupList";

  export let isLoading = false;
  export let filteredGroups: ExerciseGroup[] = [];
  export let expandedGroups: { [groupId: string]: boolean } = {};
  export let onToggleGroup: (groupId: string) => void;
  export let onEditGroup: (group: ExerciseGroup) => void;
  export let onEditExercise: (ex: ExerciseRecord) => void;
  export let onNewVersion: (ex: ExerciseRecord) => void;
  export let onDiff: (ex: ExerciseRecord) => void;
  export let onRegroup: (ex: ExerciseRecord) => void;
  export let onDelete: (ex: ExerciseRecord) => void;
  export let onOpenVariant: (ex: ExerciseRecord) => void;
  export let onCreateFirst: () => void;
</script>

{#if isLoading}
  <div class="exercise-group-list-loading is-loading">Loading exercise library...</div>
{:else if filteredGroups.length === 0}
  <div class="exercise-group-list-empty-state">
    <p>No exercises found matching your criteria.</p>
    <button class="exercise-group-list-create-btn" on:click={onCreateFirst}>Create First Exercise</button>
  </div>
{:else}
  <div class="exercise-group-list-exercise-group-list">
    {#each filteredGroups as group}
      {@const rep = getGroupRepresentative(group)}
      {@const variantCount = group.variants.size}
      {@const isExpanded = !!expandedGroups[group.groupId]}
      <div class="exercise-group-list-exercise-group-card">
        <!-- ── Group Header (always visible) ── -->
        <div
          class="exercise-group-list-group-header"
          role="button"
          tabindex="0"
          aria-expanded={isExpanded}
          on:click={() => onToggleGroup(group.groupId)}
          on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleGroup(group.groupId); } }}
        >
          <div class="exercise-group-list-group-title-row">
            <h3>{group.name || "Untitled"}</h3>
            <div class="exercise-group-list-group-meta">
              {#if group.topicTag}
                <span class="exercise-group-list-topic-badge">{group.topicTag}</span>
              {/if}
              {#if rep?.grade}
                <span class="exercise-group-list-meta-badge exercise-group-list-grade-badge">Klasse {rep.grade}</span>
              {/if}
              {#if rep?.subject}
                <span class="exercise-group-list-meta-badge exercise-group-list-subject-badge">{rep.subject}</span>
              {/if}
              <span class="exercise-group-list-score-badge">
                {group.variants.size > 1 && group.minPoints !== group.maxPoints
                  ? `${group.minPoints}-${group.maxPoints} Pkt`
                  : `${group.maxPoints} Pkt`}
              </span>
              <span class="exercise-group-list-variant-count-badge">{variantCount} variant{variantCount !== 1 ? 's' : ''}</span>
              <button
                class="exercise-group-list-group-action-btn edit-group-btn"
                title="Edit Group Metadata (Name, Topic Tag, Grade, Subject)"
                aria-label="Edit Group Metadata"
                on:click|stopPropagation={() => onEditGroup(group)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
            </div>
          </div>

          <!-- Variant pills row (collapsed preview) -->
          {#if !isExpanded}
            <div class="exercise-group-list-variant-pills-row">
              {#each group.variants.keys() as vKey}
                {@const vMembers = group.variants.get(vKey) || []}
                {@const latestVer = vMembers[0]?.version || 1}
                <span class="exercise-group-list-variant-pill{vKey !== '_General' ? ' has-variant' : ''}">
                  {vKey} <strong>v{latestVer}</strong>
                </span>
              {/each}
            </div>
          {/if}

          <button class="exercise-group-list-expand-toggle" class:expanded={isExpanded}>
            {isExpanded ? '▲' : '▼'}
          </button>
        </div>

        <!-- ── Expanded Body ── -->
        {#if isExpanded}
          <div class="exercise-group-list-group-body">
            {#each group.variants as [vKey, vMembers]}
              <div class="exercise-group-list-variant-section">
                <div class="exercise-group-list-variant-header">
                  <span class="exercise-group-list-variant-label{vKey !== '_General' ? ' has-variant' : ''}">
                    {vKey}
                  </span>
                  <span class="exercise-group-list-variant-version">v{vMembers[0]?.version || 1}{vMembers[0]?.isCurrent ? ' ← current' : ''}</span>
                </div>

                {#each vMembers as member}
                  <div class="exercise-group-list-variant-member">
                    <div class="exercise-group-list-member-info">
                      <span class="exercise-group-list-member-version-badge">v{member.version}</span>
                      {#if member.isCurrent}
                        <span class="exercise-group-list-current-tag">current</span>
                      {/if}
                    </div>

                    <div class="exercise-group-list-snippet-preview">
                      <LatexViewer code={(member.ex.latexBody || "").slice(0, 150) + "..."} snippet={true} />
                    </div>

                    <div class="exercise-group-list-member-actions">
                      <button
                        class="exercise-group-list-action-btn exercise-group-list-edit-btn"
                        title="Edit exercise"
                        on:click={() => onEditExercise(member.ex)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                        <span>Edit</span>
                      </button>
                      <button
                        class="exercise-group-list-action-btn exercise-group-list-version-btn"
                        title="Create new version"
                        on:click={() => onNewVersion(member.ex)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <line x1="12" y1="18" x2="12" y2="12"></line>
                          <line x1="9" y1="15" x2="15" y2="15"></line>
                        </svg>
                        <span>+Ver</span>
                      </button>
                      <button
                        class="exercise-group-list-action-btn exercise-group-list-diff-btn"
                        title="Compare LaTeX diff"
                        on:click={() => onDiff(member.ex)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M16 3h5v5"></path>
                          <path d="M8 21H3v-5"></path>
                          <path d="M21 3L14 10"></path>
                          <path d="M3 21l7-7"></path>
                        </svg>
                        <span>Diff</span>
                      </button>
                      <button
                        class="exercise-group-list-action-btn regroup-btn"
                        title="Re-group exercise"
                        on:click={() => onRegroup(member.ex)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M14 4h6v6"></path>
                          <path d="M10 20H4v-6"></path>
                          <path d="M20 4L14 10"></path>
                          <path d="M4 20l6-6"></path>
                        </svg>
                        <span>Regroup</span>
                      </button>
                      <button
                        class="exercise-group-list-action-btn exercise-group-list-delete-btn"
                        title="Delete exercise"
                        on:click={() => onDelete(member.ex)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            {/each}

            <!-- Group-level actions -->
            <div class="exercise-group-list-group-actions">
              <button
                class="exercise-group-list-group-action-btn edit-group-btn"
                title="Edit Group Metadata (Name, Topic Tag, Grade, Subject)"
                on:click={() => onEditGroup(group)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                <span>Edit Group</span>
              </button>
              <button
                class="exercise-group-list-group-action-btn exercise-group-list-variant-btn"
                title="Create parallel variant"
                on:click={() => onOpenVariant(rep)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                  <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                  <rect x="14" y="14" width="7" height="7" rx="1"></rect>
                  <path d="M6 10v7a2 2 0 0 0 2 2h6"></path>
                </svg>
                <span>+ Variant</span>
              </button>
              <button
                class="exercise-group-list-group-action-btn exercise-group-list-version-btn"
                title="Create new version of first variant"
                on:click={() => onNewVersion(rep)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <line x1="12" y1="18" x2="12" y2="12"></line>
                  <line x1="9" y1="15" x2="15" y2="15"></line>
                </svg>
                <span>+ Version</span>
              </button>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

