<script module lang="ts">
  export interface ExamItemRef {
    type: "exercise" | "mc_group";
    id: string;
  }
</script>

<script lang="ts">
  import type { ExerciseRecord } from '#lib/db/schema';
  import { parseExerciseScore } from '#lib/latex/scoreParser';
  import { mcSubLabel } from '#lib/grading/mcGroupLabels';
  import ExerciseLabel from '#lib/components/exam/ExerciseLabel.svelte';
  import { t } from '#lib/i18n';
  import { faArrowUp, faArrowDown, faXmark } from '@fortawesome/free-solid-svg-icons';
  import { Badge, Button, Card } from '#lib/components/ui';

  interface McGroup {
    id: string;
    title: string;
    scoringText: string;
    memberIds: string[];
  }

  interface Props {
    exercises: ExerciseRecord[];
    mcGroups?: McGroup[];
    libraryExercises?: ExerciseRecord[];
    examItems?: ExamItemRef[];
    onRemove: (exerciseId: string) => void;
    onAddExercises?: (() => void) | undefined;
    onMoveUp?: ((index: number) => void) | undefined;
    onMoveDown?: ((index: number) => void) | undefined;
    onMoveExamItem?: ((index: number, direction: "up" | "down") => void) | undefined;
    onRemoveMcGroup?: ((groupId: string) => void) | undefined;
    onEditMcGroup?: ((groupId: string) => void) | undefined;
  }

  let {
    exercises,
    mcGroups = [],
    libraryExercises = [],
    examItems = [],
    onRemove,
    onAddExercises = undefined,
    onMoveUp = undefined,
    onMoveDown = undefined,
    onMoveExamItem = undefined,
    onRemoveMcGroup = undefined,
    onEditMcGroup = undefined
  }: Props = $props();

  function memberExercises(group: McGroup): ExerciseRecord[] {
    return group.memberIds
      // `exercises` first: it is the authoritative per-exam copy, and
      // `libraryExercises` may still be loading (or hold a different variant of
      // the same id). Same precedence as resolveMcExercises().
      .map((id) => exercises.find((e) => e.id === id) || libraryExercises.find((e) => e.id === id))
      .filter((e): e is ExerciseRecord => Boolean(e));
  }

  function groupPoints(group: McGroup): number {
    return memberExercises(group).reduce(
      (sum, ex) => sum + (parseExerciseScore(ex.latexBody || "") || ex.maxPoints || 0),
      0,
    );
  }

  // Rows are subgrids of one list grid, so number, points and controls line up across all rows. On
  // phones the controls drop to their own line (3 tracks); from `sm` they take the fourth track.
  const listClass = "grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]";
  const rowClass = "col-span-3 grid grid-cols-subgrid items-center gap-y-1 rounded-md border border-line bg-surface-inset px-3 py-2 sm:col-span-4";
  const numberClass = "text-right font-semibold text-muted tabular-nums";
  const titleClass = "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-content";
  const pointsClass = "text-right text-sm whitespace-nowrap text-muted tabular-nums";
  const actionsClass = "col-span-2 col-start-2 flex justify-self-end gap-1 sm:col-span-1 sm:col-start-4 sm:row-start-1";
  const subItemsClass = "col-span-2 col-start-2 m-0 pl-4 text-sm text-muted sm:col-span-3";

  let totalItemCount = $derived(examItems.length > 0 ? examItems.length : exercises.length + mcGroups.length);
</script>

{#snippet exerciseRow(exercise: ExerciseRecord, idx: number, count: number, up: () => void, down: () => void)}
  <div class={rowClass}>
    <span class={numberClass}>{idx + 1}.</span>
    <div class={titleClass}>
      <ExerciseLabel {exercise} />
      {#if exercise.topicTag}
        <Badge severity="secondary">{exercise.topicTag}</Badge>
      {/if}
      {#if exercise.questionType && exercise.questionType !== 'free_text'}
        <Badge severity="primary">{exercise.questionType.toUpperCase()}</Badge>
      {/if}
    </div>
    <span class={pointsClass}>{exercise.maxPoints} {$t("exam.exerciseList.points")}</span>
    <div class={actionsClass}>
      <Button
        size="sm" variant="text" severity="secondary" iconOnly icon={faArrowUp}
        ariaLabel={$t("exam.mcStagingPanel.moveUp")}
        onClick={up}
        disabled={idx === 0}
      />
      <Button
        size="sm" variant="text" severity="secondary" iconOnly icon={faArrowDown}
        ariaLabel={$t("exam.mcStagingPanel.moveDown")}
        onClick={down}
        disabled={idx === count - 1}
      />
      <Button
        size="sm" variant="text" severity="danger" iconOnly icon={faXmark}
        ariaLabel={$t("exam.mcStagingPanel.remove")}
        onClick={() => onRemove(exercise.id)}
      />
    </div>
  </div>
{/snippet}

<!-- `idx` is null in the unordered fallback list: no number, no move buttons. -->
{#snippet groupRow(group: McGroup, idx: number | null)}
  <div class={rowClass}>
    <span class={numberClass}>{idx === null ? "" : `${idx + 1}.`}</span>
    <div class={titleClass}>
      <strong class="min-w-0">{$t("exam.exerciseList.mcGroupLabel", { title: group.title })}</strong>
      <Badge severity="primary">{$t("exam.exerciseList.subExercisesCount", { count: memberExercises(group).length })}</Badge>
    </div>
    <span class={pointsClass}>{groupPoints(group)} {$t("exam.exerciseList.points")}</span>
    <ul class={subItemsClass}>
      {#each memberExercises(group) as ex, i}
        <li>{mcSubLabel(i, group.memberIds.length)}) <ExerciseLabel exercise={ex} /></li>
      {/each}
    </ul>
    <div class={actionsClass}>
      {#if onEditMcGroup}
        <Button
          size="sm" variant="text"
          onClick={() => onEditMcGroup(group.id)}
          title={$t("exam.exerciseList.editGroup")}
        >{$t("exam.exerciseList.editGroupButton")}</Button>
      {/if}
      {#if idx !== null && onMoveExamItem}
        <Button
          size="sm" variant="text" severity="secondary" iconOnly icon={faArrowUp}
          ariaLabel={$t("exam.mcStagingPanel.moveUp")}
          onClick={() => onMoveExamItem(idx, "up")}
          disabled={idx === 0}
        />
        <Button
          size="sm" variant="text" severity="secondary" iconOnly icon={faArrowDown}
          ariaLabel={$t("exam.mcStagingPanel.moveDown")}
          onClick={() => onMoveExamItem(idx, "down")}
          disabled={idx === examItems.length - 1}
        />
      {/if}
      {#if onRemoveMcGroup}
        <Button
          size="sm" variant="text" severity="danger" iconOnly icon={faXmark}
          ariaLabel={$t("exam.mcStagingPanel.remove")}
          onClick={() => onRemoveMcGroup(group.id)}
        />
      {/if}
    </div>
  </div>
{/snippet}

<Card title={$t("exam.exerciseList.heading", { count: totalItemCount })}>
  {#snippet actions()}
    {#if onAddExercises}
      <Button size="sm" onClick={onAddExercises}>{$t("exam.actionBar.addExercises")}</Button>
    {/if}
  {/snippet}

  {#if totalItemCount === 0}
    <p class="m-0 rounded-md border border-dashed border-line-strong p-8 text-center text-muted">{$t("exam.exerciseList.empty")}</p>
  {:else}
    <div class={listClass}>
      {#if examItems.length > 0}
        {#each examItems as item, idx (item.id)}
          {#if item.type === "exercise"}
            {@const exercise = exercises.find((e) => e.id === item.id) || libraryExercises.find((e) => e.id === item.id)}
            {#if exercise}
              {@render exerciseRow(
                exercise,
                idx,
                examItems.length,
                () => (onMoveExamItem ? onMoveExamItem(idx, "up") : onMoveUp && onMoveUp(idx)),
                () => (onMoveExamItem ? onMoveExamItem(idx, "down") : onMoveDown && onMoveDown(idx)),
              )}
            {/if}
          {:else if item.type === "mc_group"}
            {@const group = mcGroups.find((g) => g.id === item.id)}
            {#if group}
              {@render groupRow(group, idx)}
            {/if}
          {/if}
        {/each}
      {:else}
        {#each exercises as exercise, i (exercise.id)}
          {@render exerciseRow(
            exercise,
            i,
            exercises.length,
            () => onMoveUp && onMoveUp(i),
            () => onMoveDown && onMoveDown(i),
          )}
        {/each}
        {#each mcGroups as group (group.id)}
          {@render groupRow(group, null)}
        {/each}
      {/if}
    </div>
  {/if}
</Card>
