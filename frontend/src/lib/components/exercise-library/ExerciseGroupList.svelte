<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import type { ExamUsageEntry } from "$lib/exercise-library/examUsage";
  import { getGroupRepresentative, type ExerciseGroup } from "./ExerciseGroupList";
  import { t } from "$lib/i18n";
  import {
    faPenToSquare,
    faFileCirclePlus,
    faCodeCompare,
    faRightLeft,
    faTrash,
    faClone,
    faEye
  } from "@fortawesome/free-solid-svg-icons";
  import { Badge, Button, ExpandableCard } from "$lib/components/ui";

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
  export let onPreview: (ex: ExerciseRecord) => void;
  /** Keyed `${groupId}|${variantKey}`; absent = not requested yet. */
  export let usageMap: Map<string, ExamUsageEntry[] | "loading"> = new Map();
  export let onOpenVariant: (ex: ExerciseRecord) => void;
  export let onCreateFirst: () => void;

  const variantPillBase =
    "rounded-xl border border-line bg-surface-sunken px-2.5 py-1 text-xs text-muted";
  const variantPillHasVariant =
    "rounded-xl border border-info bg-info/15 px-2.5 py-1 text-xs text-info-fg";

  const variantLabelBase = "rounded-md bg-surface-inset px-2.5 py-1 text-sm font-bold text-content";
  const variantLabelHasVariant = "rounded-md bg-info/25 px-2.5 py-1 text-sm font-bold text-info-fg";
</script>

{#if isLoading}
  <div class="p-12 text-center text-muted">{$t("exercises.groupList.loading")}</div>
{:else if filteredGroups.length === 0}
  <div class="flex flex-col items-center gap-4 p-12 text-center text-muted">
    <p class="m-0">{$t("exercises.groupList.empty")}</p>
    <Button onClick={onCreateFirst}>{$t("exercises.groupList.createFirst")}</Button>
  </div>
{:else}
  <div class="flex flex-col gap-4">
    {#each filteredGroups as group (group.groupId)}
      {@const rep = getGroupRepresentative(group)}
      {@const variantCount = group.variants.size}
      {@const isExpanded = !!expandedGroups[group.groupId]}
      <ExpandableCard expanded={isExpanded} onToggle={() => onToggleGroup(group.groupId)}>
        <svelte:fragment slot="header">
          <div class="flex items-start gap-4">
            <div class="flex min-w-0 flex-1 flex-wrap items-center gap-3">
              <h3 class="m-0 text-lg font-semibold text-content">{group.name || $t("exercises.untitled")}</h3>
              <div class="flex flex-wrap items-center gap-2">
                {#if group.topicTag}
                  <Badge>{group.topicTag}</Badge>
                {/if}
                {#if rep?.grade}
                  <Badge severity="info">{$t("exercises.groupList.gradeBadge", { grade: rep.grade })}</Badge>
                {/if}
                {#if rep?.subject}
                  <Badge severity="success">{rep.subject}</Badge>
                {/if}
                <Badge severity="primary">
                  {group.variants.size > 1 && group.minPoints !== group.maxPoints
                    ? $t("exercises.groupList.pointsRange", { min: group.minPoints, max: group.maxPoints })
                    : $t("exercises.groupList.pointsSingle", { max: group.maxPoints })}
                </Badge>
                <Badge>{variantCount !== 1 ? $t("exercises.groupList.variantCountPlural", { count: variantCount }) : $t("exercises.groupList.variantCountSingular", { count: variantCount })}</Badge>
                <span on:click|stopPropagation on:keydown|stopPropagation role="presentation">
                  <Button
                    variant="text"
                    severity="secondary"
                    size="sm"
                    iconOnly
                    icon={faPenToSquare}
                    title={$t("exercises.groupList.editGroupTitle")}
                    ariaLabel={$t("exercises.groupList.editGroupAriaLabel")}
                    onClick={() => onEditGroup(group)}
                  />
                </span>
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
          </div>
        </svelte:fragment>

        <svelte:fragment slot="body">
          {#each group.variants as [vKey, vMembers], vIdx}
            {@const used = usageMap.get(`${group.groupId}|${vKey}`)}
            <div class="{vIdx === group.variants.size - 1 ? '' : 'mb-4 border-b border-line pb-4'}">
              <div class="mb-3 flex items-center gap-3">
                <span class={vKey !== '_General' ? variantLabelHasVariant : variantLabelBase}>
                  {vKey}
                </span>
                <span class="text-xs text-muted">v{vMembers[0]?.version || 1}{vMembers[0]?.isCurrent ? $t("exercises.groupList.currentSuffix") : ''}</span>
              </div>

              <div class="mb-3 ml-2 text-sm">
                <h4 class="m-0 mb-1 text-xs font-semibold text-muted">{$t("exercises.groupList.usedInExams")}</h4>
                {#if used === undefined || used === "loading"}
                  <p class="m-0 text-muted">{$t("exercises.groupList.loadingUsage")}</p>
                {:else if used.length === 0}
                  <p class="m-0 text-muted">{$t("exercises.groupList.notUsed")}</p>
                {:else}
                  <ul class="m-0 flex list-none flex-wrap gap-2 p-0">
                    {#each used as exam (exam.id)}
                      <li class="min-w-0">
                        <a
                          href="/exam/{exam.id}"
                          class="inline-block break-words rounded-md border border-line bg-surface-sunken px-2 py-1 text-accent hover:bg-highlight"
                        >{exam.title}{exam.datum ? ` (${exam.datum})` : ""}</a>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>

              {#each vMembers as member}
                <div class="mb-3 ml-2">
                  <div class="mb-2 flex items-center gap-2">
                    <Badge>v{member.version}</Badge>
                    {#if member.isCurrent}
                      <Badge severity="success">{$t("exercises.groupList.currentBadge")}</Badge>
                    {/if}
                  </div>

                  <div class="flex flex-wrap justify-end gap-1.5">
                    <Button
                      variant="outlined"
                      severity="secondary"
                      size="sm"
                      icon={faEye}
                      onClick={() => onPreview(member.ex)}
                    >{$t("common.preview")}</Button>
                    <Button
                      variant="outlined"
                      severity="secondary"
                      size="sm"
                      icon={faPenToSquare}
                      title={$t("exercises.groupList.editExerciseTitle")}
                      onClick={() => onEditExercise(member.ex)}
                    >{$t("common.edit")}</Button>
                    <Button
                      variant="outlined"
                      severity="secondary"
                      size="sm"
                      icon={faFileCirclePlus}
                      title={$t("exercises.groupList.newVersionTitle")}
                      onClick={() => onNewVersion(member.ex)}
                    >{$t("exercises.groupList.newVersionAbbr")}</Button>
                    <Button
                      variant="outlined"
                      severity="secondary"
                      size="sm"
                      icon={faCodeCompare}
                      title={$t("exercises.groupList.diffTitle")}
                      onClick={() => onDiff(member.ex)}
                    >{$t("exercises.groupList.diffText")}</Button>
                    <Button
                      variant="outlined"
                      severity="secondary"
                      size="sm"
                      icon={faRightLeft}
                      title={$t("exercises.groupList.regroupTitle")}
                      onClick={() => onRegroup(member.ex)}
                    >{$t("exercises.groupList.regroupText")}</Button>
                    <Button
                      variant="outlined"
                      severity="danger"
                      size="sm"
                      icon={faTrash}
                      title={$t("exercises.groupList.deleteTitle")}
                      ariaLabel={$t("exercises.groupList.deleteTitle")}
                      iconOnly
                      onClick={() => onDelete(member.ex)}
                    />
                  </div>
                </div>
              {/each}
            </div>
          {/each}

          <!-- Group-level actions -->
          <div class="mt-2 flex justify-end gap-2 border-t border-dashed border-line pt-4">
            <Button
              variant="outlined"
              severity="secondary"
              size="sm"
              icon={faPenToSquare}
              title={$t("exercises.groupList.editGroupTitle")}
              onClick={() => onEditGroup(group)}
            >{$t("exercises.groupList.editGroupButtonText")}</Button>
            <Button
              variant="outlined"
              severity="secondary"
              size="sm"
              icon={faClone}
              title={$t("exercises.groupList.createVariantTitle")}
              onClick={() => onOpenVariant(rep)}
            >{$t("exercises.groupList.createVariantText")}</Button>
            <Button
              variant="outlined"
              severity="secondary"
              size="sm"
              icon={faFileCirclePlus}
              title={$t("exercises.groupList.newVersionOfFirstTitle")}
              onClick={() => onNewVersion(rep)}
            >{$t("exercises.groupList.newVersionText")}</Button>
          </div>
        </svelte:fragment>
      </ExpandableCard>
    {/each}
  </div>
{/if}
