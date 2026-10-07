<script lang="ts">
  import type { ExerciseRecord } from "#lib/db/schema";
  import type { LazyEntry } from "#lib/utils/lazyMap";
  import { usageKey, type ExamUsageEntry } from "#lib/exercise-library/examUsage";
  import { getGroupRepresentative, type ExerciseGroup } from "#lib/exercise-library/groupExercises";
  import type { SyncStatus } from "#lib/api/exerciseSharing";
  import { t } from "#lib/i18n";
  import {
    faPenToSquare,
    faFileCirclePlus,
    faCodeCompare,
    faRightLeft,
    faTrash,
    faClone,
    faEye,
    faEllipsisVertical,
    faShareNodes,
    faRotate,
    faLinkSlash,
    faCopy,
    faCodePullRequest
  } from "@fortawesome/free-solid-svg-icons";
  import { Badge, Button, ExpandableCard, Menu, MenuItem } from "#lib/components/ui";

  const noop = () => {};

  interface Props {
    /** `shared`: other accounts' exercises (issue #65), preview and copy only. */
    mode?: "own" | "shared";
    isLoading?: boolean;
    filteredGroups?: ExerciseGroup[];
    expandedGroups?: { [groupId: string]: boolean };
    onToggleGroup: (groupId: string) => void;
    onEditGroup?: (group: ExerciseGroup) => void;
    onEditExercise?: (ex: ExerciseRecord) => void;
    onNewVersion?: (ex: ExerciseRecord) => void;
    onDiff?: (ex: ExerciseRecord) => void;
    onRegroup?: (ex: ExerciseRecord) => void;
    onDelete?: (ex: ExerciseRecord) => void;
    onPreview: (ex: ExerciseRecord) => void;
    /** Keyed `${groupId}|${variantKey}`; absent = not requested yet. */
    usageMap?: Map<string, LazyEntry<ExamUsageEntry[]>>;
    onOpenVariant?: (ex: ExerciseRecord) => void;
    onCreateFirst?: () => void;
    /** The account may share and copy (capability `exercise_sharing`). */
    sharingEnabled?: boolean;
    /** Own copied groups by group id: their state against the shared source. */
    syncStatus?: Map<string, SyncStatus>;
    /** Shared mode: the sharer's e-mail by group id. */
    sharedBy?: Map<string, string>;
    onShare?: (group: ExerciseGroup) => void;
    onResync?: (group: ExerciseGroup) => void;
    onUnlink?: (group: ExerciseGroup) => void;
    onCopy?: (group: ExerciseGroup) => void;
    /** Propose the copy's changes to the original's author. */
    onContribute?: (group: ExerciseGroup) => void;
    /** Group id of a copy in progress. */
    copyingGroupId?: string;
  }

  let {
    mode = "own",
    isLoading = false,
    filteredGroups = [],
    expandedGroups = {},
    onToggleGroup,
    onEditGroup = noop,
    onEditExercise = noop,
    onNewVersion = noop,
    onDiff = noop,
    onRegroup = noop,
    onDelete = noop,
    onPreview,
    usageMap = new Map(),
    onOpenVariant = noop,
    onCreateFirst = noop,
    sharingEnabled = false,
    syncStatus = new Map(),
    sharedBy = new Map(),
    onShare = noop,
    onResync = noop,
    onUnlink = noop,
    onCopy = noop,
    onContribute = noop,
    copyingGroupId = ""
  }: Props = $props();

  let isShared = $derived(mode === "shared");

  function groupIsShared(group: ExerciseGroup): boolean {
    return group.allMembers.some((m) => m.ex.isShared);
  }

  /** Copied from another account: never shared as one's own (contributing back is the path). */
  function groupIsCopy(group: ExerciseGroup): boolean {
    return group.allMembers.some((m) => m.ex.groupCopied);
  }

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
    {#if isShared}
      <p class="m-0">{$t("exercises.sharing.empty")}</p>
    {:else}
      <p class="m-0">{$t("exercises.groupList.empty")}</p>
      <Button onClick={onCreateFirst}>{$t("exercises.groupList.createFirst")}</Button>
    {/if}
  </div>
{:else}
  <div class="flex flex-col gap-4">
    {#each filteredGroups as group (group.groupId)}
      {@const rep = getGroupRepresentative(group)}
      {@const variantCount = group.variants.size}
      {@const isExpanded = !!expandedGroups[group.groupId]}
      {@const sync = syncStatus.get(group.groupId)}
      <ExpandableCard
        title={group.name || $t("exercises.untitled")}
        expanded={isExpanded}
        onToggle={() => onToggleGroup(group.groupId)}
      >
        {#snippet badges()}
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
          {#if isShared}
            <Badge severity="contrast">{$t("exercises.sharing.sharedBy", { email: sharedBy.get(group.groupId) ?? "" })}</Badge>
          {:else}
            {#if groupIsShared(group)}
              <Badge severity="info" icon={faShareNodes} title={$t("exercises.sharing.sharedBadgeTitle")}>{$t("exercises.sharing.sharedBadge")}</Badge>
            {/if}
            {#if sync?.state === "update_available"}
              <Badge severity="warning" icon={faRotate}>{$t("exercises.sharing.updateBadge")}</Badge>
            {:else if sync?.state === "source_unavailable"}
              <Badge>{$t("exercises.sharing.unavailableBadge")}</Badge>
            {:else if sync}
              <Badge title={$t("exercises.sharing.linkedTitle")}>{$t("exercises.sharing.linkedBadge")}</Badge>
            {/if}
          {/if}
        {/snippet}

        {#snippet actions()}
          {#if !isShared}
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
          {/if}
        {/snippet}

        {#snippet preview()}
          {#each group.variants.keys() as vKey}
            {@const vMembers = group.variants.get(vKey) || []}
            {@const latestVer = vMembers[0]?.version || 1}
            <span class={vKey !== '_General' ? variantPillHasVariant : variantPillBase}>
              {vKey} <strong>v{latestVer}</strong>
            </span>
          {/each}
        {/snippet}

        {#snippet body()}
          {#each group.variants as [vKey, vMembers], vIdx}
            {@const used = usageMap.get(usageKey(group.groupId, vKey))}
            <div class="{vIdx === group.variants.size - 1 ? '' : 'mb-2 border-b border-line pb-2'}">
              <div class="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span class={vKey !== '_General' ? variantLabelHasVariant : variantLabelBase}>
                  {vKey}
                </span>
                {#if !isShared}
                <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <span class="font-semibold">{$t("exercises.groupList.usedInExams")}:</span>
                  {#if used === undefined || used.status === "loading"}
                    <span>{$t("exercises.groupList.loadingUsage")}</span>
                  {:else if used.status === "error"}
                    <span class="text-danger-fg">{$t("common.loadFailedShort")}</span>
                  {:else if used.value.length === 0}
                    <span>{$t("exercises.groupList.notUsed")}</span>
                  {:else}
                    {#each used.value as exam (exam.id)}
                      <a
                        href="/exam/{exam.id}"
                        class="min-w-0 break-words rounded-md border border-line bg-surface-sunken px-1.5 py-0.5 text-accent hover:bg-highlight"
                      >{exam.title}{exam.datum ? ` (${exam.datum})` : ""}</a>
                    {/each}
                  {/if}
                </div>
                {/if}
              </div>

              {#each vMembers as member}
                <div class="mb-1.5 ml-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                  <div class="flex items-center gap-2">
                    <Badge>v{member.version}</Badge>
                    {#if member.isCurrent}
                      <Badge severity="success">{$t("exercises.groupList.currentBadge")}</Badge>
                    {/if}
                  </div>
                  <div class="flex items-center gap-2">
                    <Button
                      variant="outlined"
                      severity="secondary"
                      size="sm"
                      icon={faEye}
                      onClick={() => onPreview(member.ex)}
                    >{$t("common.preview")}</Button>
                    {#if !isShared}
                    <Button
                      variant="outlined"
                      severity="secondary"
                      size="sm"
                      icon={faPenToSquare}
                      title={$t("exercises.groupList.editExerciseTitle")}
                      onClick={() => onEditExercise(member.ex)}
                    >{$t("common.edit")}</Button>
                    <Menu
                      label={$t("exercises.groupList.moreActions")}
                      icon={faEllipsisVertical}
                      showLabel={false}
                      chevron={false}
                    >
                      <MenuItem icon={faFileCirclePlus} onSelect={() => onNewVersion(member.ex)}>{$t("exercises.groupList.newVersionTitle")}</MenuItem>
                      <MenuItem icon={faCodeCompare} onSelect={() => onDiff(member.ex)}>{$t("exercises.groupList.diffTitle")}</MenuItem>
                      <MenuItem icon={faRightLeft} onSelect={() => onRegroup(member.ex)}>{$t("exercises.groupList.regroupTitle")}</MenuItem>
                      <MenuItem icon={faTrash} danger onSelect={() => onDelete(member.ex)}>{$t("exercises.groupList.deleteTitle")}</MenuItem>
                    </Menu>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/each}
        {/snippet}

        {#snippet footer()}
          {#if isShared}
            <Button
              size="sm"
              icon={faCopy}
              loading={copyingGroupId === group.groupId}
              disabled={!!copyingGroupId && copyingGroupId !== group.groupId}
              onClick={() => onCopy(group)}
            >{$t("exercises.sharing.copy")}</Button>
          {:else}
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
          {#if (sharingEnabled && !groupIsCopy(group)) || groupIsShared(group)}
            <Button
              variant="outlined"
              severity="secondary"
              size="sm"
              icon={faShareNodes}
              onClick={() => onShare(group)}
            >{groupIsShared(group) ? $t("exercises.sharing.stopSharing") : $t("exercises.sharing.share")}</Button>
          {/if}
          {#if sync && sharingEnabled && sync.state !== "source_unavailable"}
            <Button
              variant={sync.state === "update_available" ? "solid" : "outlined"}
              severity={sync.state === "update_available" ? "primary" : "secondary"}
              size="sm"
              icon={faRotate}
              onClick={() => onResync(group)}
            >{$t("exercises.sharing.resync")}</Button>
          {/if}
          {#if sync && sharingEnabled && sync.state !== "source_unavailable" && (sync.locallyModified || sync.localVariants > 0)}
            <Button
              variant="outlined"
              severity="secondary"
              size="sm"
              icon={faCodePullRequest}
              onClick={() => onContribute(group)}
            >{$t("exercises.contributions.propose")}</Button>
          {/if}
          {#if sync}
            <Button variant="text" severity="secondary" size="sm" icon={faLinkSlash} onClick={() => onUnlink(group)}
            >{$t("exercises.sharing.unlink")}</Button>
          {/if}
          {/if}
        {/snippet}
      </ExpandableCard>
    {/each}
  </div>
{/if}
