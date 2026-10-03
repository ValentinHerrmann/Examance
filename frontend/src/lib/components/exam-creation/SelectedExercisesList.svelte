<script module lang="ts">
  export interface ExamItemRef {
    type: "exercise" | "mc_group";
    id: string;
  }
</script>

<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import { parseExerciseScore } from "$lib/latex/scoreParser";
  import { mcSubLabel } from "$lib/grading/mcGroupLabels";
  import ExerciseLabel from "$lib/components/exam/ExerciseLabel.svelte";
  import { t } from "$lib/i18n";
  import { faPen, faArrowUp, faArrowDown, faXmark } from "@fortawesome/free-solid-svg-icons";
  import { Badge, Button, Card } from "$lib/components/ui";

  interface McGroup {
    id: string;
    title: string;
    scoringText: string;
    memberIds: string[];
  }

  interface Props {
    selectedExercises: ExerciseRecord[];
    totalPoints: number;
    isPreviewLoading: boolean;
    onLivePreview: () => void;
    onQuickEdit: (ex: ExerciseRecord) => void;
    onMoveExercise: (index: number, direction: "up" | "down") => void;
    onMoveExamItem?: ((index: number, direction: "up" | "down") => void) | undefined;
    onRemove: (id: string) => void;
    mcGroups?: McGroup[];
    libraryExercises?: ExerciseRecord[];
    examItems?: ExamItemRef[];
    onRemoveMcGroup?: (id: string) => void;
    onEditMcGroup?: ((id: string) => void) | undefined;
  }

  let {
    selectedExercises,
    totalPoints,
    isPreviewLoading,
    onLivePreview,
    onQuickEdit,
    onMoveExercise,
    onMoveExamItem = undefined,
    onRemove,
    mcGroups = [],
    libraryExercises = [],
    examItems = [],
    onRemoveMcGroup = () => {},
    onEditMcGroup = undefined
  }: Props = $props();

  function memberExercises(group: McGroup): ExerciseRecord[] {
    return group.memberIds
      .map((id) => libraryExercises.find((e) => e.id === id) || selectedExercises.find((e) => e.id === id))
      .filter((e): e is ExerciseRecord => Boolean(e));
  }

  function groupPoints(group: McGroup): number {
    return memberExercises(group).reduce(
      (sum, ex) => sum + (parseExerciseScore(ex.latexBody || "") || ex.maxPoints || 0),
      0,
    );
  }

  const rowClass =
    "flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border border-line bg-surface-sunken px-4 py-3";
  const infoClass = "flex min-w-0 flex-wrap items-center gap-3";

  let totalItemCount = $derived(examItems.length > 0 ? examItems.length : selectedExercises.length + mcGroups.length);
</script>

<Card class="mb-6">
  <div class="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
    <h2 class="m-0 min-w-0 text-xl font-medium text-content">
      {$t("examCreation.selectedList.heading", { count: totalItemCount, points: totalPoints })}
    </h2>
    <Button
      variant="outlined"
      loading={isPreviewLoading}
      onClick={onLivePreview}
      disabled={isPreviewLoading || totalItemCount === 0}
    >
      {isPreviewLoading ? $t("examCreation.selectedList.previewButtonCompiling") : $t("examCreation.selectedList.previewButton")}
    </Button>
  </div>

  {#if totalItemCount === 0}
    <div class="p-6 text-center text-sm text-muted">
      {$t("examCreation.selectedList.emptyHint")}
    </div>
  {:else}
    <div class="flex flex-col gap-2.5">
      {#if examItems.length > 0}
        {#each examItems as item, idx (item.id)}
          {#if item.type === "exercise"}
            {@const ex = selectedExercises.find((e) => e.id === item.id) || libraryExercises.find((e) => e.id === item.id)}
            {#if ex}
              {@const score = parseExerciseScore(ex.latexBody || "") || ex.maxPoints || 0}
              <div class={rowClass}>
                <div class={infoClass}>
                  <span class="font-semibold text-accent">(idx + 1)</span>
                  <strong class="min-w-0 font-medium text-content"><ExerciseLabel exercise={ex} /></strong>
                  {#if ex.topicTag}
                    <Badge size="xs">{ex.topicTag}</Badge>
                  {/if}
                  <Badge size="xs" severity="primary">{score} {$t("examCreation.selectedList.pointsAbbrev")}</Badge>
                </div>
                <div class="flex flex-wrap items-center gap-1">
                  <Button size="sm" variant="text" severity="secondary" iconOnly icon={faPen} ariaLabel={$t("examCreation.selectedList.quickEditTitle")} title={$t("examCreation.selectedList.quickEditTitle")} onClick={() => onQuickEdit(ex)} />
                  <Button size="sm" variant="text" severity="secondary" iconOnly icon={faArrowUp} ariaLabel={$t("exam.mcStagingPanel.moveUp")} disabled={idx === 0} onClick={() => onMoveExamItem ? onMoveExamItem(idx, "up") : onMoveExercise(idx, "up")} />
                  <Button size="sm" variant="text" severity="secondary" iconOnly icon={faArrowDown} ariaLabel={$t("exam.mcStagingPanel.moveDown")} disabled={idx === examItems.length - 1} onClick={() => onMoveExamItem ? onMoveExamItem(idx, "down") : onMoveExercise(idx, "down")} />
                  <Button size="sm" variant="text" severity="danger" iconOnly icon={faXmark} ariaLabel={$t("exam.mcStagingPanel.remove")} onClick={() => onRemove(ex.id)} />
                </div>
              </div>
            {/if}
          {:else if item.type === "mc_group"}
            {@const group = mcGroups.find((g) => g.id === item.id)}
            {#if group}
              <div class="{rowClass} flex-col items-stretch gap-1.5">
                <div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <div class={infoClass}>
                    <span class="font-semibold text-accent">({idx + 1})</span>
                    <strong class="min-w-0 font-medium text-content">{$t("examCreation.selectedList.mcGroupLabel", { title: group.title })}</strong>
                    <Badge size="xs">{$t("examCreation.selectedList.mcGroupSubItems", { count: memberExercises(group).length })}</Badge>
                    <Badge size="xs" severity="primary">{groupPoints(group)} {$t("examCreation.selectedList.pointsAbbrev")}</Badge>
                  </div>
                  <div class="flex flex-wrap items-center gap-1">
                    {#if onEditMcGroup}
                    <Button size="sm" variant="text" severity="secondary" iconOnly icon={faPen} ariaLabel={$t("examCreation.selectedList.editMcGroupTitle")} title={$t("examCreation.selectedList.editMcGroupTitle")} onClick={() => onEditMcGroup && onEditMcGroup(group.id)} />
                  {/if}
                    <Button size="sm" variant="text" severity="secondary" iconOnly icon={faArrowUp} ariaLabel={$t("exam.mcStagingPanel.moveUp")} disabled={idx === 0} onClick={() => onMoveExamItem && onMoveExamItem(idx, "up")} />
                    <Button size="sm" variant="text" severity="secondary" iconOnly icon={faArrowDown} ariaLabel={$t("exam.mcStagingPanel.moveDown")} disabled={idx === examItems.length - 1} onClick={() => onMoveExamItem && onMoveExamItem(idx, "down")} />
                    <Button size="sm" variant="text" severity="danger" iconOnly icon={faXmark} ariaLabel={$t("exam.mcStagingPanel.remove")} onClick={() => onRemoveMcGroup(group.id)} />
                  </div>
                </div>
                <ul class="m-0 pl-6 text-sm text-muted">
                  {#each memberExercises(group) as ex, i}
                    <li>{mcSubLabel(i, group.memberIds.length)}) <ExerciseLabel exercise={ex} /></li>
                  {/each}
                </ul>
              </div>
            {/if}
          {/if}
        {/each}
      {:else}
        {#each selectedExercises as ex, idx}
          {@const score = parseExerciseScore(ex.latexBody || "") || ex.maxPoints || 0}
          <div class={rowClass}>
            <div class={infoClass}>
              <span class="font-semibold text-accent">(idx + 1)</span>
              <strong class="min-w-0 font-medium text-content"><ExerciseLabel exercise={ex} /></strong>
              {#if ex.topicTag}
                <Badge size="xs">{ex.topicTag}</Badge>
              {/if}
              <Badge size="xs" severity="primary">{score} {$t("examCreation.selectedList.pointsAbbrev")}</Badge>
            </div>
            <div class="flex flex-wrap items-center gap-1">
              <Button size="sm" variant="text" severity="secondary" iconOnly icon={faPen} ariaLabel={$t("examCreation.selectedList.quickEditTitle")} title={$t("examCreation.selectedList.quickEditTitle")} onClick={() => onQuickEdit(ex)} />
              <Button size="sm" variant="text" severity="secondary" iconOnly icon={faArrowUp} ariaLabel={$t("exam.mcStagingPanel.moveUp")} disabled={idx === 0} onClick={() => onMoveExercise(idx, "up")} />
              <Button size="sm" variant="text" severity="secondary" iconOnly icon={faArrowDown} ariaLabel={$t("exam.mcStagingPanel.moveDown")} disabled={idx === selectedExercises.length - 1} onClick={() => onMoveExercise(idx, "down")} />
              <Button size="sm" variant="text" severity="danger" iconOnly icon={faXmark} ariaLabel={$t("exam.mcStagingPanel.remove")} onClick={() => onRemove(ex.id)} />
            </div>
          </div>
        {/each}

        {#each mcGroups as group}
          <div class="{rowClass} flex-col items-stretch gap-1.5">
            <div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <div class={infoClass}>
                <strong class="min-w-0 font-medium text-content">{$t("examCreation.selectedList.mcGroupLabel", { title: group.title })}</strong>
                <Badge size="xs">{$t("examCreation.selectedList.mcGroupSubItems", { count: memberExercises(group).length })}</Badge>
                <Badge size="xs" severity="primary">{groupPoints(group)} {$t("examCreation.selectedList.pointsAbbrev")}</Badge>
              </div>
              <Button size="sm" variant="text" severity="danger" iconOnly icon={faXmark} ariaLabel={$t("exam.mcStagingPanel.remove")} onClick={() => onRemoveMcGroup(group.id)} />
            </div>
            <ul class="m-0 pl-6 text-sm text-muted">
              {#each memberExercises(group) as ex, i}
                <li>{mcSubLabel(i, group.memberIds.length)}) <ExerciseLabel exercise={ex} /></li>
              {/each}
            </ul>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</Card>
