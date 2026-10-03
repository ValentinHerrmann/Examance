<script lang="ts">
  import { type ExerciseGroup } from "#lib/exercise-library/groupExercises";
  import type { ExerciseRecord } from "#lib/db/schema";
  import { parseExerciseScore } from "#lib/latex/scoreParser";
  import { isMcQuestion } from "#lib/grading/mcScore";
  import { t } from "#lib/i18n";
  import { faPenToSquare, faEye, faCheck } from "@fortawesome/free-solid-svg-icons";
  import { Button, Badge, Checkbox, Icon, TextInput, Select } from "#lib/components/ui";

  interface Props {
    filteredGroups: ExerciseGroup[];
    totalVariantsCount: number;
    availableGrades: string[];
    availableSubjects: string[];
    availableTopics: string[];
    searchQuery: string;
    selectedGradeFilter: string;
    selectedSubjectFilter: string;
    selectedTopicFilter: string;
    typeFilter?: "normal" | "mc";
    activeVariantPerGroup: Record<string, string>;
    selectedLibraryIds: string[];
    mcStagingIds?: string[];
    /** exerciseId → title of the MC group it already belongs to; such questions cannot be staged again. */
    mcGroupMembership?: Record<string, string>;
    onToggleSelection: (id: string) => void;
    onToggleMcStaging?: (id: string) => void;
    onSetGroupVariant: (groupId: string, vKey: string) => void;
    onQuickEdit: (ex: ExerciseRecord) => void;
    onOpenPreview: (ex: ExerciseRecord) => void;
  }

  let {
    filteredGroups,
    totalVariantsCount,
    availableGrades,
    availableSubjects,
    availableTopics,
    searchQuery = $bindable(),
    selectedGradeFilter = $bindable(),
    selectedSubjectFilter = $bindable(),
    selectedTopicFilter = $bindable(),
    typeFilter = "normal",
    activeVariantPerGroup,
    selectedLibraryIds,
    mcStagingIds = [],
    mcGroupMembership = {},
    onToggleSelection,
    onToggleMcStaging = () => {},
    onSetGroupVariant,
    onQuickEdit,
    onOpenPreview
  }: Props = $props();

  function checkboxTitle(isMc: boolean, isSelected: boolean, ownerGroup: string | undefined): string {
    if (!isMc) {
      return isSelected ? $t("exercises.libraryPicker.checkboxRemoveFromExam") : $t("exercises.libraryPicker.checkboxAddToExam");
    }
    if (ownerGroup !== undefined) return $t("exercises.libraryPicker.checkboxInOtherMcGroup", { title: ownerGroup });
    return isSelected ? $t("exercises.libraryPicker.checkboxRemoveMcStaging") : $t("exercises.libraryPicker.checkboxAddMcStaging");
  }

  const pillBase =
    "cursor-pointer rounded-xl border border-line bg-surface-base px-2.5 py-1 text-sm text-muted hover:border-line-strong";
  const pillActive =
    "cursor-pointer rounded-xl border border-accent bg-primary px-2.5 py-1 text-sm text-primary-contrast";

  const variantPillBase =
    "inline-flex cursor-pointer items-center gap-1 rounded-md border border-line bg-surface-raised px-2 py-0.5 text-xs font-medium text-muted hover:border-accent hover:text-content pointer-coarse:min-h-11";
  const variantPillHasSelected =
    "inline-flex cursor-pointer items-center gap-1 rounded-md border border-success bg-surface-raised px-2 py-0.5 text-xs font-medium text-muted hover:text-content pointer-coarse:min-h-11";
  const variantPillActive =
    "inline-flex cursor-pointer items-center gap-1 rounded-md border border-accent bg-primary px-2 py-0.5 text-xs font-semibold text-primary-contrast pointer-coarse:min-h-11";
  const variantPillActiveHasSelected =
    "inline-flex cursor-pointer items-center gap-1 rounded-md border border-success bg-success px-2 py-0.5 text-xs font-semibold text-success-contrast pointer-coarse:min-h-11";

  function variantPillClass(active: boolean, hasSelected: boolean): string {
    if (active && hasSelected) return variantPillActiveHasSelected;
    if (active) return variantPillActive;
    if (hasSelected) return variantPillHasSelected;
    return variantPillBase;
  }

  const rowBase =
    "flex flex-wrap items-start gap-3 rounded-xl border border-line bg-surface-raised px-4 py-3 hover:border-line-strong hover:bg-highlight @3xl:flex-nowrap";
  const rowSelected =
    "flex flex-wrap items-start gap-3 rounded-xl border border-primary bg-primary/10 px-4 py-3 @3xl:flex-nowrap";

  let displayedGroups = $derived(filteredGroups.filter((g) => {
    if (selectedTopicFilter !== "ALL" && g.topicTag !== selectedTopicFilter) return false;
    const activeVKey = activeVariantPerGroup[g.groupId] || Array.from(g.variants.keys())[0] || "_General";
    const vMembers = g.variants.get(activeVKey) || [];
    const activeEx = vMembers[0]?.ex;
    if (!activeEx) return false;
    const isMc = isMcQuestion(activeEx);
    return typeFilter === "mc" ? isMc : !isMc;
  }));
</script>

<div class="mb-4 flex flex-col gap-3">
  <div class="flex flex-wrap items-stretch justify-between gap-4 @3xl:items-center">
    <TextInput
      placeholder={$t("exercises.libraryPicker.searchPlaceholder")}
      bind:value={searchQuery}
      class="flex-[1_1_18rem]"
    />
    <span class="text-sm font-medium text-muted @3xl:whitespace-nowrap">
      {$t("exercises.libraryPicker.groupsSummary", { groups: displayedGroups.length, variants: totalVariantsCount })}
    </span>
  </div>

  <div class="flex flex-col flex-wrap items-stretch gap-x-4 gap-y-3 @3xl:flex-row @3xl:items-center">
    {#if availableGrades.length > 0}
      <div class="flex w-full min-w-0 flex-auto items-center gap-2 text-sm text-muted @3xl:w-auto @3xl:flex-[0_1_15rem]">
        <label for="picker-grade">{$t("exercises.libraryPicker.gradeLabel")}</label>
        <Select id="picker-grade" size="sm" bind:value={selectedGradeFilter}>
          <option value="ALL">{$t("exercises.libraryPicker.allGrades")}</option>
          {#each availableGrades as g}
            <option value={g}>{$t("exercises.libraryPicker.gradeOption", { grade: g })}</option>
          {/each}
        </Select>
      </div>
    {/if}

    {#if availableSubjects.length > 0}
      <div class="flex w-full min-w-0 flex-auto items-center gap-2 text-sm text-muted @3xl:w-auto @3xl:flex-[0_1_15rem]">
        <label for="picker-subject">{$t("exercises.libraryPicker.subjectLabel")}</label>
        <Select id="picker-subject" size="sm" bind:value={selectedSubjectFilter}>
          <option value="ALL">{$t("exercises.libraryPicker.allSubjects")}</option>
          {#each availableSubjects as s}
            <option value={s}>{s}</option>
          {/each}
        </Select>
      </div>
    {/if}
  </div>

  <div class="flex flex-wrap gap-1.5">
    <button
      type="button"
      class={selectedTopicFilter === "ALL" ? pillActive : pillBase}
      onclick={() => (selectedTopicFilter = "ALL")}
    >
      {$t("exercises.libraryPicker.allTopics", { count: filteredGroups.length })}
    </button>
    {#each availableTopics as topic}
      {@const groupCount = filteredGroups.filter((g) => g.topicTag === topic).length}
      <button
        type="button"
        class={selectedTopicFilter === topic ? pillActive : pillBase}
        onclick={() => (selectedTopicFilter = topic)}
      >
        {topic} ({groupCount})
      </button>
    {/each}
  </div>
</div>

{#if displayedGroups.length === 0}
  <div class="p-6 text-center text-sm text-muted">
    {$t("exercises.libraryPicker.empty")}
  </div>
{:else}
  <div class="flex flex-col gap-3">
    {#each displayedGroups as group}
      {@const activeVKey = activeVariantPerGroup[group.groupId] || Array.from(group.variants.keys())[0] || "_General"}
      {@const vMembers = group.variants.get(activeVKey) || []}
      {@const activeMember = vMembers[0]}
      {@const activeEx = activeMember?.ex}
      {@const isMc = activeEx ? isMcQuestion(activeEx) : false}
      {@const ownerGroup = isMc && activeEx ? mcGroupMembership[activeEx.id] : undefined}
      {@const isSelected = activeEx ? (isMc ? mcStagingIds.includes(activeEx.id) : selectedLibraryIds.includes(activeEx.id)) : false}
      {@const groupSelectedCount = group.allMembers.filter(m => selectedLibraryIds.includes(m.ex.id) || mcStagingIds.includes(m.ex.id)).length}
      {@const score = activeEx ? (parseExerciseScore(activeEx.latexBody || "") || activeEx.maxPoints || 0) : 0}

      <div class={groupSelectedCount > 0 ? rowSelected : rowBase}>
        <!-- Selection Checkbox -->
        <div class="flex items-center">
          {#if activeEx}
            <Checkbox
              checked={isSelected}
              disabled={ownerGroup !== undefined}
              onChange={() => (isMc ? onToggleMcStaging(activeEx.id) : onToggleSelection(activeEx.id))}
              title={checkboxTitle(isMc, isSelected, ownerGroup)}
              aria-label={checkboxTitle(isMc, isSelected, ownerGroup)}
            />
          {/if}
        </div>

        <!-- Main Info: Title, Topic, Variants -->
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <div class="flex flex-wrap items-start gap-2.5">
            <span class="min-w-0 overflow-hidden text-ellipsis whitespace-normal text-base font-semibold text-content @xl:whitespace-nowrap">{group.name}</span>

            {#if group.topicTag}
              <Badge size="xs">{group.topicTag}</Badge>
            {/if}

            {#if isMc}
              <Badge size="xs" severity="warning">MC</Badge>
            {/if}

            {#if ownerGroup !== undefined}
              <Badge size="xs" severity="warning">
                {$t("exercises.libraryPicker.inMcGroupBadge", { title: ownerGroup })}
              </Badge>
            {/if}

            {#if groupSelectedCount > 0}
              <Badge size="xs" severity="success" icon={faCheck}>
                {isMc ? $t("exercises.libraryPicker.stagedCount", { count: groupSelectedCount }) : $t("exercises.libraryPicker.inExamCount", { count: groupSelectedCount })}
              </Badge>
            {/if}
          </div>

          <!-- Inline Variant Selector Pills (if multiple variants exist) -->
          {#if group.variants.size > 1}
            <div class="flex w-full flex-wrap items-center gap-1.5 @xl:w-auto">
              {#each group.variants.keys() as vKey}
                {@const members = group.variants.get(vKey) || []}
                {@const hasSelected = members.some(m => selectedLibraryIds.includes(m.ex.id) || mcStagingIds.includes(m.ex.id) || m.ex.id in mcGroupMembership)}
                <button
                  type="button"
                  class={variantPillClass(vKey === activeVKey, hasSelected)}
                  onclick={() => onSetGroupVariant(group.groupId, vKey)}
                  title={$t("exercises.libraryPicker.switchVariantTitle", { key: vKey })}
                >
                  {#if hasSelected}
                    <Icon icon={faCheck} class="text-success-fg" />
                  {/if}
                  <span>{vKey}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Right Actions: Points, Quick Edit & Preview Button -->
        <div class="flex w-full flex-wrap items-start justify-start gap-2 whitespace-nowrap ml-0 @3xl:ml-auto @3xl:w-auto @3xl:justify-end">
          <Badge size="xs" severity="primary">
            {group.variants.size > 1 && group.minPoints !== group.maxPoints
              ? $t("exercises.libraryPicker.pointsRange", { min: group.minPoints, max: group.maxPoints })
              : $t("exercises.libraryPicker.pointsSingle", { score })}
          </Badge>

          {#if activeEx}
            <Button
              variant="outlined"
              severity="secondary"
              size="sm"
              icon={faPenToSquare}
              title={$t("exercises.libraryPicker.quickEditTitle")}
              onClick={() => onQuickEdit(activeEx)}
            >{$t("exercises.libraryPicker.quickEditText")}</Button>
            <Button
              variant="outlined"
              size="sm"
              icon={faEye}
              title={$t("exercises.libraryPicker.quickPreviewTitle")}
              onClick={() => onOpenPreview(activeEx)}
            >{$t("common.preview")}</Button>
          {/if}
        </div>
      </div>
    {/each}
  </div>
{/if}

