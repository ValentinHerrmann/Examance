<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import LatexViewer from "$lib/components/LatexViewer.svelte";
  import { getGroupRepresentative, type ExerciseGroup } from "./ExerciseGroupList";
  import { t } from "$lib/i18n";

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
    "inline-flex items-center gap-[0.35rem] whitespace-nowrap rounded-md border-0 px-3 py-[0.45rem] text-xs font-semibold cursor-pointer transition-colors duration-150 ease-[ease]";
  const groupActionBtnVersion = `${groupActionBtnBase} bg-surface-inset text-accent`;
  const groupActionBtnVariant = `${groupActionBtnBase} bg-info/10 text-info-fg`;

  const actionBtnBase =
    "inline-flex items-center gap-[0.35rem] whitespace-nowrap rounded-md border-0 px-[0.55rem] py-[0.375rem] text-xs font-semibold leading-none cursor-pointer transition-colors duration-150 ease-[ease]";
  const actionBtnEdit = `${actionBtnBase} bg-surface-inset text-content`;
  const actionBtnDelete = `${actionBtnBase} bg-danger/20 text-danger-fg`;
  const actionBtnVersion = `${actionBtnBase} bg-surface-inset text-accent`;
  const actionBtnDiff = `${actionBtnBase} bg-highlight text-accent`;

  const variantPillBase =
    "rounded-xl border border-line bg-surface-sunken px-[0.6rem] py-[0.2rem] text-xs text-muted";
  const variantPillHasVariant =
    "rounded-xl border border-info bg-info/15 px-[0.6rem] py-[0.2rem] text-xs text-info-fg";

  const variantLabelBase = "rounded-md bg-surface-inset px-[0.6rem] py-[0.2rem] text-sm font-bold text-content";
  const variantLabelHasVariant = "rounded-md bg-info/25 px-[0.6rem] py-[0.2rem] text-sm font-bold text-info-fg";
</script>

{#if isLoading}
  <div class="p-12 text-center text-muted">{$t("exercises.groupList.loading")}</div>
{:else if filteredGroups.length === 0}
  <div class="p-12 text-center text-muted">
    <p>{$t("exercises.groupList.empty")}</p>
    <button class="cursor-pointer rounded-md border-0 bg-primary px-5 py-[0.625rem] font-semibold text-primary-contrast hover:bg-primary" on:click={onCreateFirst}>{$t("exercises.groupList.createFirst")}</button>
  </div>
{:else}
  <div class="flex flex-col gap-4">
    {#each filteredGroups as group}
      {@const rep = getGroupRepresentative(group)}
      {@const variantCount = group.variants.size}
      {@const isExpanded = !!expandedGroups[group.groupId]}
      <div class="overflow-hidden rounded-xl border border-line bg-surface-raised">
        <!-- ── Group Header (always visible) ── -->
        <div
          class="flex select-none items-start gap-4 p-5 cursor-pointer transition-colors duration-150 ease-[ease] hover:bg-primary/[0.04]"
          role="button"
          tabindex="0"
          aria-expanded={isExpanded}
          on:click={() => onToggleGroup(group.groupId)}
          on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleGroup(group.groupId); } }}
        >
          <div class="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <h3 class="m-0 text-lg text-accent">{group.name || $t("exercises.untitled")}</h3>
            <div class="flex flex-wrap items-center gap-2">
              {#if group.topicTag}
                <span class="rounded-sm bg-surface-inset px-2 py-[0.15rem] text-xs text-content">{group.topicTag}</span>
              {/if}
              {#if rep?.grade}
                <span class="rounded-sm border border-info bg-info/10 px-2 py-[0.15rem] text-xs text-info-fg">{$t("exercises.groupList.gradeBadge", { grade: rep.grade })}</span>
              {/if}
              {#if rep?.subject}
                <span class="rounded-sm border border-success bg-success/10 px-2 py-[0.15rem] text-xs text-success-fg">{rep.subject}</span>
              {/if}
              <span class="rounded-sm bg-primary px-2 py-[0.15rem] text-xs font-semibold text-accent">
                {group.variants.size > 1 && group.minPoints !== group.maxPoints
                  ? $t("exercises.groupList.pointsRange", { min: group.minPoints, max: group.maxPoints })
                  : $t("exercises.groupList.pointsSingle", { max: group.maxPoints })}
              </span>
              <span class="rounded-sm bg-surface-sunken px-2 py-[0.15rem] text-xs text-muted">{variantCount !== 1 ? $t("exercises.groupList.variantCountPlural", { count: variantCount }) : $t("exercises.groupList.variantCountSingular", { count: variantCount })}</span>
              <button
                class={groupActionBtnBase}
                title={$t("exercises.groupList.editGroupTitle")}
                aria-label={$t("exercises.groupList.editGroupAriaLabel")}
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

          <button class="mt-1 shrink-0 cursor-pointer border-0 bg-transparent px-2 py-1 text-base transition-colors duration-150 ease-[ease] {isExpanded ? 'text-accent' : 'text-muted'}">
            {isExpanded ? '▲' : '▼'}
          </button>
        </div>

        <!-- ── Expanded Body ── -->
        {#if isExpanded}
          <div class="border-t border-line bg-surface-sunken/30 px-5 pb-5 pt-4">
            {#each group.variants as [vKey, vMembers], vIdx}
              <div class="{vIdx === group.variants.size - 1 ? '' : 'mb-4 border-b border-line pb-4'}">
                <div class="mb-3 flex items-center gap-3">
                  <span class={vKey !== '_General' ? variantLabelHasVariant : variantLabelBase}>
                    {vKey}
                  </span>
                  <span class="text-xs text-muted">v{vMembers[0]?.version || 1}{vMembers[0]?.isCurrent ? $t("exercises.groupList.currentSuffix") : ''}</span>
                </div>

                {#each vMembers as member}
                  <div class="mb-3 ml-2">
                    <div class="mb-2 flex items-center gap-2">
                      <span class="rounded-sm bg-surface-sunken px-2 py-[0.15rem] text-xs text-muted">v{member.version}</span>
                      {#if member.isCurrent}
                        <span class="rounded-sm bg-success/15 px-[0.4rem] py-[0.1rem] text-xs font-semibold uppercase text-success-fg">{$t("exercises.groupList.currentBadge")}</span>
                      {/if}
                    </div>

                    <div class="mb-3 max-h-20 overflow-hidden rounded-md bg-surface-sunken p-3 text-xs text-muted">
                      <LatexViewer code={(member.ex.latexBody || "").slice(0, 150) + "..."} snippet={true} />
                    </div>

                    <div class="flex flex-wrap justify-end gap-[0.375rem]">
                      <button
                        class={actionBtnEdit}
                        title={$t("exercises.groupList.editExerciseTitle")}
                        on:click={() => onEditExercise(member.ex)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                        <span>{$t("common.edit")}</span>
                      </button>
                      <button
                        class={actionBtnVersion}
                        title={$t("exercises.groupList.newVersionTitle")}
                        on:click={() => onNewVersion(member.ex)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <line x1="12" y1="18" x2="12" y2="12"></line>
                          <line x1="9" y1="15" x2="15" y2="15"></line>
                        </svg>
                        <span>{$t("exercises.groupList.newVersionAbbr")}</span>
                      </button>
                      <button
                        class={actionBtnDiff}
                        title={$t("exercises.groupList.diffTitle")}
                        on:click={() => onDiff(member.ex)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M16 3h5v5"></path>
                          <path d="M8 21H3v-5"></path>
                          <path d="M21 3L14 10"></path>
                          <path d="M3 21l7-7"></path>
                        </svg>
                        <span>{$t("exercises.groupList.diffText")}</span>
                      </button>
                      <button
                        class={actionBtnBase}
                        title={$t("exercises.groupList.regroupTitle")}
                        on:click={() => onRegroup(member.ex)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M14 4h6v6"></path>
                          <path d="M10 20H4v-6"></path>
                          <path d="M20 4L14 10"></path>
                          <path d="M4 20l6-6"></path>
                        </svg>
                        <span>{$t("exercises.groupList.regroupText")}</span>
                      </button>
                      <button
                        class={actionBtnDelete}
                        title={$t("exercises.groupList.deleteTitle")}
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
            <div class="mt-2 flex justify-end gap-2 border-t border-dashed border-line pt-4">
              <button
                class={groupActionBtnBase}
                title={$t("exercises.groupList.editGroupTitle")}
                on:click={() => onEditGroup(group)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                <span>{$t("exercises.groupList.editGroupButtonText")}</span>
              </button>
              <button
                class={groupActionBtnVariant}
                title={$t("exercises.groupList.createVariantTitle")}
                on:click={() => onOpenVariant(rep)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                  <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                  <rect x="14" y="14" width="7" height="7" rx="1"></rect>
                  <path d="M6 10v7a2 2 0 0 0 2 2h6"></path>
                </svg>
                <span>{$t("exercises.groupList.createVariantText")}</span>
              </button>
              <button
                class={groupActionBtnVersion}
                title={$t("exercises.groupList.newVersionOfFirstTitle")}
                on:click={() => onNewVersion(rep)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <line x1="12" y1="18" x2="12" y2="12"></line>
                  <line x1="9" y1="15" x2="15" y2="15"></line>
                </svg>
                <span>{$t("exercises.groupList.newVersionText")}</span>
              </button>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

