<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import LatexViewer from "$lib/components/LatexViewer.svelte";

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

  function getGroupRepresentative(group: ExerciseGroup): ExerciseRecord {
    return group.allMembers[0]?.ex || ({ id: "", name: group.name } as ExerciseRecord);
  }
</script>

{#if isLoading}
  <div class="loading is-loading">Loading exercise library...</div>
{:else if filteredGroups.length === 0}
  <div class="empty-state">
    <p>No exercises found matching your criteria.</p>
    <button class="create-btn" on:click={onCreateFirst}>Create First Exercise</button>
  </div>
{:else}
  <div class="exercise-group-list">
    {#each filteredGroups as group}
      {@const rep = getGroupRepresentative(group)}
      {@const variantCount = group.variants.size}
      {@const isExpanded = !!expandedGroups[group.groupId]}
      <div class="exercise-group-card">
        <!-- ── Group Header (always visible) ── -->
        <div
          class="group-header"
          role="button"
          tabindex="0"
          aria-expanded={isExpanded}
          on:click={() => onToggleGroup(group.groupId)}
          on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleGroup(group.groupId); } }}
        >
          <div class="group-title-row">
            <h3>{group.name || "Untitled"}</h3>
            <div class="group-meta">
              {#if group.topicTag}
                <span class="topic-badge">{group.topicTag}</span>
              {/if}
              {#if rep?.grade}
                <span class="meta-badge grade-badge">Klasse {rep.grade}</span>
              {/if}
              {#if rep?.subject}
                <span class="meta-badge subject-badge">{rep.subject}</span>
              {/if}
              <span class="score-badge">
                {group.variants.size > 1 && group.minPoints !== group.maxPoints
                  ? `${group.minPoints}-${group.maxPoints} Pkt`
                  : `${group.maxPoints} Pkt`}
              </span>
              <span class="variant-count-badge">{variantCount} variant{variantCount !== 1 ? 's' : ''}</span>
              <button
                class="group-action-btn edit-group-btn"
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
            <div class="variant-pills-row">
              {#each group.variants.keys() as vKey}
                {@const vMembers = group.variants.get(vKey) || []}
                {@const latestVer = vMembers[0]?.version || 1}
                <span class="variant-pill{vKey !== '_General' ? ' has-variant' : ''}">
                  {vKey} <strong>v{latestVer}</strong>
                </span>
              {/each}
            </div>
          {/if}

          <button class="expand-toggle" class:expanded={isExpanded}>
            {isExpanded ? '▲' : '▼'}
          </button>
        </div>

        <!-- ── Expanded Body ── -->
        {#if isExpanded}
          <div class="group-body">
            {#each group.variants as [vKey, vMembers]}
              <div class="variant-section">
                <div class="variant-header">
                  <span class="variant-label{vKey !== '_General' ? ' has-variant' : ''}">
                    {vKey}
                  </span>
                  <span class="variant-version">v{vMembers[0]?.version || 1}{vMembers[0]?.isCurrent ? ' ← current' : ''}</span>
                </div>

                {#each vMembers as member}
                  <div class="variant-member">
                    <div class="member-info">
                      <span class="member-version-badge">v{member.version}</span>
                      {#if member.isCurrent}
                        <span class="current-tag">current</span>
                      {/if}
                    </div>

                    <div class="snippet-preview">
                      <LatexViewer code={(member.ex.latexBody || "").slice(0, 150) + "..."} snippet={true} />
                    </div>

                    <div class="member-actions">
                      <button
                        class="action-btn edit-btn"
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
                        class="action-btn version-btn"
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
                        class="action-btn diff-btn"
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
                        class="action-btn regroup-btn"
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
                        class="action-btn delete-btn"
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
            <div class="group-actions">
              <button
                class="group-action-btn edit-group-btn"
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
                class="group-action-btn variant-btn"
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
                class="group-action-btn version-btn"
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

<style>
  .loading,
  .empty-state {
    text-align: center;
    padding: 3rem;
    color: #94a3b8;
  }

  .create-btn {
    background: #0284c7;
    color: white;
    border: none;
    padding: 0.625rem 1.25rem;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
  }

  .create-btn:hover {
    background: #0369a1;
  }

  /* ── Group List Layout ── */
  .exercise-group-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .exercise-group-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 10px;
    overflow: hidden;
  }

  /* ── Group Header ── */
  .group-header {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1.25rem;
    cursor: pointer;
    user-select: none;
    transition: background 0.15s ease;
  }

  .group-header:hover {
    background: rgba(56, 189, 248, 0.04);
  }

  .group-title-row {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }

  .group-title-row h3 {
    margin: 0;
    color: #38bdf8;
    font-size: 1.1rem;
  }

  .group-meta {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .topic-badge {
    background: #334155;
    color: #cbd5e1;
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
  }

  .meta-badge {
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
  }

  .grade-badge {
    background: #1e1b4b;
    color: #c7d2fe;
    border: 1px solid #4338ca;
  }

  .subject-badge {
    background: #064e3b;
    color: #a7f3d0;
    border: 1px solid #047857;
  }

  .score-badge {
    background: #0369a1;
    color: #e0f2fe;
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    font-weight: 600;
  }

  .variant-count-badge {
    background: #0f172a;
    color: #94a3b8;
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
  }

  /* Variant pills shown in collapsed state */
  .variant-pills-row {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }

  .variant-pill {
    font-size: 0.78rem;
    padding: 0.2rem 0.6rem;
    border-radius: 12px;
    background: #0f172a;
    color: #94a3b8;
    border: 1px solid #334155;
  }

  .variant-pill.has-variant {
    background: rgba(139, 92, 246, 0.15);
    color: #c4b5fd;
    border-color: #8b5cf6;
  }

  .expand-toggle {
    background: transparent;
    border: none;
    color: #64748b;
    font-size: 1rem;
    cursor: pointer;
    padding: 0.25rem 0.5rem;
    transition: color 0.15s ease, transform 0.2s ease;
    flex-shrink: 0;
    margin-top: 0.25rem;
  }

  .expand-toggle.expanded {
    color: #38bdf8;
  }

  /* ── Group Body (expanded) ── */
  .group-body {
    border-top: 1px solid #334155;
    padding: 1rem 1.25rem 1.25rem;
    background: rgba(15, 23, 42, 0.3);
  }

  .variant-section {
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid rgba(51, 65, 85, 0.5);
  }

  .variant-section:last-of-type {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
  }

  .variant-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .variant-label {
    font-size: 0.9rem;
    font-weight: 700;
    padding: 0.2rem 0.6rem;
    border-radius: 6px;
    background: #334155;
    color: #cbd5e1;
  }

  .variant-label.has-variant {
    background: rgba(139, 92, 246, 0.25);
    color: #ddd6fe;
  }

  .variant-version {
    font-size: 0.8rem;
    color: #64748b;
  }

  .variant-member {
    margin-left: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .member-info {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .member-version-badge {
    background: #0f172a;
    color: #64748b;
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
  }

  .current-tag {
    font-size: 0.7rem;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    background: rgba(34, 197, 94, 0.15);
    color: #86efac;
    font-weight: 600;
    text-transform: uppercase;
  }

  .snippet-preview {
    background: #0f172a;
    padding: 0.75rem;
    border-radius: 6px;
    margin-bottom: 0.75rem;
    font-size: 0.8rem;
    color: #94a3b8;
    max-height: 80px;
    overflow: hidden;
  }

  .member-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    justify-content: flex-end;
  }

  /* ── Group-level actions ── */
  .group-actions {
    display: flex;
    gap: 0.5rem;
    padding-top: 1rem;
    border-top: 1px dashed rgba(51, 65, 85, 0.6);
    margin-top: 0.5rem;
    justify-content: flex-end;
  }

  .group-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.45rem 0.75rem;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
    transition: background 0.15s ease, opacity 0.15s ease;
  }

  /* ── Action Buttons ── */
  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.375rem 0.55rem;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    font-size: 0.775rem;
    font-weight: 600;
    white-space: nowrap;
    line-height: 1;
    transition: background 0.15s ease, opacity 0.15s ease;
  }

  .action-btn svg {
    flex-shrink: 0;
  }

  .edit-btn {
    background: #334155;
    color: white;
  }

  .delete-btn {
    background: rgba(239, 68, 68, 0.2);
    color: #fca5a5;
  }

  .version-btn {
    background: #334155;
    color: #38bdf8;
  }

  .group-action-btn.version-btn {
    background: #334155;
    color: #38bdf8;
  }

  .variant-btn {
    background: #4c1d95;
    color: #ddd6fe;
  }

  .group-action-btn.variant-btn {
    background: #4c1d95;
    color: #ddd6fe;
  }

  .diff-btn {
    background: #1e3a8a;
    color: #93c5fd;
  }
</style>
