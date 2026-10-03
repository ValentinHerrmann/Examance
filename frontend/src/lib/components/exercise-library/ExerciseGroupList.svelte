<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import type { ExamUsageEntry } from "$lib/exercise-library/examUsage";
  import { getGroupRepresentative, type ExerciseGroup } from "$lib/exercise-library/groupExercises";
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
      <ExpandableCard
        title={group.name || $t("exercises.untitled")}
        expanded={isExpanded}
        onToggle={() => onToggleGroup(group.groupId)}
      >
        <svelte:fragment slot="badges">
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
        </svelte:fragment>

        <svelte:fragment slot="actions">
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
        </svelte:fragment>

        <svelte:fragment slot="preview">
          {#each group.variants.keys() as vKey}
            {@const vMembers = group.variants.get(vKey) || []}
            {@const latestVer = vMembers[0]?.version || 1}
            <span class={vKey !== '_General' ? variantPillHasVariant : variantPillBase}>
              {vKey} <strong>v{latestVer}</strong>
            </span>
          {/each}
        </svelte:fragment>

        <svelte:fragment slot="body">
          {#each group.variants as [vKey, vMembers], vIdx}
            {@const used = usageMap.get(`${group.groupId}|${vKey}`)}
            <div class="{vIdx === group.variants.size - 1 ? '' : 'mb-2 border-b border-line pb-2'}">
              <div class="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span class={vKey !== '_General' ? variantLabelHasVariant : variantLabelBase}>
                  {vKey}
                </span>
                <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <span class="font-semibold">{$t("exercises.groupList.usedInExams")}:</span>
                  {#if used === undefined || used === "loading"}
                    <span>{$t("exercises.groupList.loadingUsage")}</span>
                  {:else if used.length === 0}
                    <span>{$t("exercises.groupList.notUsed")}</span>
                  {:else}
                    {#each used as exam (exam.id)}
                      <a
                        href="/exam/{exam.id}"
                        class="min-w-0 break-words rounded-md border border-line bg-surface-sunken px-1.5 py-0.5 text-accent hover:bg-highlight"
                      >{exam.title}{exam.datum ? ` (${exam.datum})` : ""}</a>
                    {/each}
                  {/if}
                </div>
              </div>

              {#each vMembers as member}
                <div class="mb-1.5 ml-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                  <div class="flex items-center gap-2">
                    <Badge>v{member.version}</Badge>
                    {#if member.isCurrent}
                      <Badge severity="success">{$t("exercises.groupList.currentBadge")}</Badge>
                    {/if}
                  </div>
                  <div class="flex flex-wrap justify-end gap-2">
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
        </svelte:fragment>

        <svelte:fragment slot="footer">
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
        </svelte:fragment>
      </ExpandableCard>
    {/each}
  </div>
{/if}
