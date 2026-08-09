<script lang="ts">
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

  const groupActionBtnBase =
    "inline-flex items-center gap-[0.35rem] whitespace-nowrap rounded-md border-0 px-3 py-[0.45rem] text-[0.8rem] font-semibold cursor-pointer transition-colors duration-150 ease-[ease]";
  const groupActionBtnVersion = `${groupActionBtnBase} bg-slate-700 text-sky-400`;
  const groupActionBtnVariant = `${groupActionBtnBase} bg-violet-900 text-violet-200`;

  const actionBtnBase =
    "inline-flex items-center gap-[0.35rem] whitespace-nowrap rounded-md border-0 px-[0.55rem] py-[0.375rem] text-[0.775rem] font-semibold leading-none cursor-pointer transition-colors duration-150 ease-[ease]";
  const actionBtnEdit = `${actionBtnBase} bg-slate-700 text-white`;
  const actionBtnDelete = `${actionBtnBase} bg-red-500/20 text-red-300`;
  const actionBtnVersion = `${actionBtnBase} bg-slate-700 text-sky-400`;
  const actionBtnDiff = `${actionBtnBase} bg-blue-900 text-blue-300`;

  const variantPillBase =
    "rounded-xl border border-slate-700 bg-slate-900 px-[0.6rem] py-[0.2rem] text-[0.78rem] text-slate-400";
  const variantPillHasVariant =
    "rounded-xl border border-violet-500 bg-violet-500/15 px-[0.6rem] py-[0.2rem] text-[0.78rem] text-violet-300";

  const variantLabelBase = "rounded-md bg-slate-700 px-[0.6rem] py-[0.2rem] text-[0.9rem] font-bold text-slate-300";
  const variantLabelHasVariant = "rounded-md bg-violet-500/25 px-[0.6rem] py-[0.2rem] text-[0.9rem] font-bold text-violet-200";
</script>

{#if isLoading}
  <div class="p-12 text-center text-slate-400">Loading exercise library...</div>
{:else if filteredGroups.length === 0}
  <div class="p-12 text-center text-slate-400">
    <p>No exercises found matching your criteria.</p>
    <button class="cursor-pointer rounded-md border-0 bg-sky-600 px-5 py-[0.625rem] font-semibold text-white hover:bg-sky-700" on:click={onCreateFirst}>Create First Exercise</button>
  </div>
{:else}
  <div class="flex flex-col gap-4">
    {#each filteredGroups as group}
      {@const rep = getGroupRepresentative(group)}
      {@const variantCount = group.variants.size}
      {@const isExpanded = !!expandedGroups[group.groupId]}
      <div class="overflow-hidden rounded-[10px] border border-slate-700 bg-slate-800">
        <!-- ── Group Header (always visible) ── -->
        <div
          class="flex select-none items-start gap-4 p-5 cursor-pointer transition-colors duration-150 ease-[ease] hover:bg-sky-400/[0.04]"
          role="button"
          tabindex="0"
          aria-expanded={isExpanded}
          on:click={() => onToggleGroup(group.groupId)}
          on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleGroup(group.groupId); } }}
        >
          <div class="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <h3 class="m-0 text-[1.1rem] text-sky-400">{group.name || "Untitled"}</h3>
            <div class="flex flex-wrap items-center gap-2">
              {#if group.topicTag}
                <span class="rounded bg-slate-700 px-2 py-[0.15rem] text-xs text-slate-300">{group.topicTag}</span>
              {/if}
              {#if rep?.grade}
                <span class="rounded border border-indigo-700 bg-indigo-950 px-2 py-[0.15rem] text-xs text-indigo-200">Klasse {rep.grade}</span>
              {/if}
              {#if rep?.subject}
                <span class="rounded border border-emerald-700 bg-emerald-900 px-2 py-[0.15rem] text-xs text-emerald-200">{rep.subject}</span>
              {/if}
              <span class="rounded bg-sky-700 px-2 py-[0.15rem] text-xs font-semibold text-sky-100">
                {group.variants.size > 1 && group.minPoints !== group.maxPoints
                  ? `${group.minPoints}-${group.maxPoints} Pkt`
                  : `${group.maxPoints} Pkt`}
              </span>
              <span class="rounded bg-slate-900 px-2 py-[0.15rem] text-xs text-slate-400">{variantCount} variant{variantCount !== 1 ? 's' : ''}</span>
              <button
                class={groupActionBtnBase}
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
            <div class="mt-2 flex flex-wrap gap-2">
              {#each group.variants.keys() as vKey}
                {@const vMembers = group.variants.get(vKey) || []}
                {@const latestVer = vMembers[0]?.version || 1}
                <span class={vKey !== '_General' ? variantPillHasVariant : variantPillBase}>
                  {vKey} <strong>v{latestVer}</strong>
                </span>
              {/each}
            </div>
          {/if}

          <button class="mt-1 shrink-0 cursor-pointer border-0 bg-transparent px-2 py-1 text-base transition-colors duration-150 ease-[ease] {isExpanded ? 'text-sky-400' : 'text-slate-500'}">
            {isExpanded ? '▲' : '▼'}
          </button>
        </div>

        <!-- ── Expanded Body ── -->
        {#if isExpanded}
          <div class="border-t border-slate-700 bg-slate-900/30 px-5 pb-5 pt-4">
            {#each group.variants as [vKey, vMembers], vIdx}
              <div class="{vIdx === group.variants.size - 1 ? '' : 'mb-4 border-b border-slate-700/50 pb-4'}">
                <div class="mb-3 flex items-center gap-3">
                  <span class={vKey !== '_General' ? variantLabelHasVariant : variantLabelBase}>
                    {vKey}
                  </span>
                  <span class="text-[0.8rem] text-slate-500">v{vMembers[0]?.version || 1}{vMembers[0]?.isCurrent ? ' ← current' : ''}</span>
                </div>

                {#each vMembers as member}
                  <div class="mb-3 ml-2">
                    <div class="mb-2 flex items-center gap-2">
                      <span class="rounded bg-slate-900 px-2 py-[0.15rem] text-xs text-slate-500">v{member.version}</span>
                      {#if member.isCurrent}
                        <span class="rounded bg-green-500/15 px-[0.4rem] py-[0.1rem] text-[0.7rem] font-semibold uppercase text-green-300">current</span>
                      {/if}
                    </div>

                    <div class="mb-3 max-h-20 overflow-hidden rounded-md bg-slate-900 p-3 text-[0.8rem] text-slate-400">
                      <LatexViewer code={(member.ex.latexBody || "").slice(0, 150) + "..."} snippet={true} />
                    </div>

                    <div class="flex flex-wrap justify-end gap-[0.375rem]">
                      <button
                        class={actionBtnEdit}
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
                        class={actionBtnVersion}
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
                        class={actionBtnDiff}
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
                        class={actionBtnBase}
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
                        class={actionBtnDelete}
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
            <div class="mt-2 flex justify-end gap-2 border-t border-dashed border-slate-700/60 pt-4">
              <button
                class={groupActionBtnBase}
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
                class={groupActionBtnVariant}
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
                class={groupActionBtnVersion}
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

