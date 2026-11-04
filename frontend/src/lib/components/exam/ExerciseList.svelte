<script module lang="ts">
  export interface ExamItemRef {
    type: "exercise" | "mc_group";
    id: string;
  }
</script>

<script lang="ts">
  import type { ExerciseRecord, ExtraNotes } from '#lib/db/schema';
  import { parseExerciseScore } from '#lib/latex/scoreParser';
  import { mcSubLabel } from '#lib/grading/mcGroupLabels';
  import ExerciseLabel from '#lib/components/exam/ExerciseLabel.svelte';
  import PageBreakDivider from '#lib/components/exam/PageBreakDivider.svelte';
  import ExtraNotesField from '#lib/components/exam/ExtraNotesField.svelte';
  import { t } from '#lib/i18n';
  import { faArrowUp, faArrowDown, faXmark } from '@fortawesome/free-solid-svg-icons';
  import { Badge, Button, Card, actionIcons } from '#lib/components/ui';

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
    /** Ids of the items that start on a new page (a break goes before each). */
    pageBreaks?: string[];
    onTogglePageBreak?: ((itemId: string) => void) | undefined;
    /** Opens an exercise name in place (editor modal). */
    onOpenExercise?: ((ex: ExerciseRecord) => void) | undefined;
    /** Karo block closing the exam (issue #156); the toggle shows only with the callback. */
    extraNotes?: ExtraNotes | null;
    onChangeExtraNotes?: ((next: ExtraNotes | null) => void) | undefined;
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
    onEditMcGroup = undefined,
    pageBreaks = [],
    onTogglePageBreak = undefined,
    onOpenExercise = undefined,
    extraNotes = null,
    onChangeExtraNotes = undefined
  }: Props = $props();

  function memberExercises(group: McGroup): ExerciseRecord[] {
    return group.memberIds
      // `exercises` first: it is the authoritative per-exam copy, and `libraryExercises` may still be loading (or hold a different variant of the same id). Same precedence as resolveMcExercises().
      .map((id) => exercises.find((e) => e.id === id) || libraryExercises.find((e) => e.id === id))
      .filter((e): e is ExerciseRecord => Boolean(e));
  }

  function groupPoints(group: McGroup): number {
    return memberExercises(group).reduce(
      (sum, ex) => sum + (parseExerciseScore(ex.latexBody || "") || ex.maxPoints || 0),
      0,
    );
  }

  // One card per item: number, then name (wraps, never cut off) with a small badge line under it, then points and icon buttons on the right.
  const listClass = "flex flex-col";
  const rowClass = "flex min-w-0 items-start gap-2 rounded-md border border-line bg-surface-inset px-3 py-2";
  const numberClass = "w-6 shrink-0 pt-0.5 text-right font-semibold text-muted tabular-nums";
  const bodyClass = "min-w-0 flex-1";
  const pointsClass = "shrink-0 pt-0.5 text-sm whitespace-nowrap text-muted tabular-nums";
  const actionsClass = "-my-1 flex shrink-0 items-center";
  const subItemsClass = "m-0 mt-1.5 flex list-none flex-col gap-1 p-0 text-sm";

  let totalItemCount = $derived(examItems.length > 0 ? examItems.length : exercises.length + mcGroups.length);
</script>

{#snippet moveButtons(idx: number, count: number, up: () => void, down: () => void)}
  <Button size="sm" variant="text" severity="secondary" iconOnly icon={faArrowUp} ariaLabel={$t("exam.mcStagingPanel.moveUp")} title={$t("exam.mcStagingPanel.moveUp")} onClick={up} disabled={idx === 0} />
  <Button size="sm" variant="text" severity="secondary" iconOnly icon={faArrowDown} ariaLabel={$t("exam.mcStagingPanel.moveDown")} title={$t("exam.mcStagingPanel.moveDown")} onClick={down} disabled={idx === count - 1} />
{/snippet}

{#snippet exerciseRow(exercise: ExerciseRecord, idx: number, count: number, up: () => void, down: () => void)}
  <div class={rowClass}>
    <span class={numberClass}>{idx + 1}.</span>
    <div class={bodyClass}>
      <ExerciseLabel stacked {exercise} onOpen={onOpenExercise ? () => onOpenExercise(exercise) : undefined}>
        {#if exercise.topicTag}<Badge size="xs" severity="secondary">{exercise.topicTag}</Badge>{/if}
        {#if exercise.questionType && exercise.questionType !== 'free_text'}<Badge size="xs" severity="primary">{exercise.questionType.toUpperCase()}</Badge>{/if}
      </ExerciseLabel>
    </div>
    <span class={pointsClass}>{exercise.maxPoints} {$t("exam.exerciseList.points")}</span>
    <div class={actionsClass}>
      {@render moveButtons(idx, count, up, down)}
      <Button size="sm" variant="text" severity="danger" iconOnly icon={faXmark} ariaLabel={$t("exam.mcStagingPanel.remove")} title={$t("exam.mcStagingPanel.remove")} onClick={() => onRemove(exercise.id)} />
    </div>
  </div>
{/snippet}

<!-- `idx` is null in the unordered fallback list: no number, no move buttons. -->
{#snippet groupRow(group: McGroup, idx: number | null)}
  <div class={rowClass}>
    <span class={numberClass}>{idx === null ? "" : `${idx + 1}.`}</span>
    <div class={bodyClass}>
      <div class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <strong class="min-w-0 break-words text-content">{$t("exam.exerciseList.mcGroupLabel", { title: group.title })}</strong>
        <Badge size="xs" severity="primary">{$t("exam.exerciseList.subExercisesCount", { count: memberExercises(group).length })}</Badge>
      </div>
      <ul class={subItemsClass}>
        {#each memberExercises(group) as ex, i}
          <li class="flex min-w-0 items-baseline gap-1.5"><span class="shrink-0 text-muted">{mcSubLabel(i, group.memberIds.length)})</span><ExerciseLabel exercise={ex} onOpen={onOpenExercise ? () => onOpenExercise(ex) : undefined} /></li>
        {/each}
      </ul>
    </div>
    <span class={pointsClass}>{groupPoints(group)} {$t("exam.exerciseList.points")}</span>
    <div class={actionsClass}>
      {#if onEditMcGroup}
        <Button size="sm" variant="text" severity="secondary" iconOnly icon={actionIcons.edit} ariaLabel={$t("exam.exerciseList.editGroup")} title={$t("exam.exerciseList.editGroup")} onClick={() => onEditMcGroup(group.id)} />
      {/if}
      {#if idx !== null && onMoveExamItem}
        {@render moveButtons(idx, examItems.length, () => onMoveExamItem(idx, "up"), () => onMoveExamItem(idx, "down"))}
      {/if}
      {#if onRemoveMcGroup}
        <Button size="sm" variant="text" severity="danger" iconOnly icon={faXmark} ariaLabel={$t("exam.mcStagingPanel.remove")} title={$t("exam.mcStagingPanel.remove")} onClick={() => onRemoveMcGroup(group.id)} />
      {/if}
    </div>
  </div>
{/snippet}

<Card title={$t("exam.exerciseList.heading", { count: totalItemCount })}>
  {#snippet actions()}
    {#if onAddExercises}
      <Button size="sm" icon={actionIcons.add} onClick={onAddExercises}>{$t("exam.exerciseList.addExercises")}</Button>
    {/if}
  {/snippet}

  {#if totalItemCount === 0}
    <p class="m-0 rounded-md border border-dashed border-line-strong p-8 text-center text-muted">{$t("exam.exerciseList.empty")}</p>
  {:else}
    <div class="{listClass} {onTogglePageBreak ? '' : 'gap-2'}">
      {#if examItems.length > 0}
        {#each examItems as item, idx (item.id)}
          {#if item.type === "exercise"}
            {@const exercise = exercises.find((e) => e.id === item.id) || libraryExercises.find((e) => e.id === item.id)}
            {#if exercise}
              {#if idx > 0 && onTogglePageBreak}
                <PageBreakDivider active={pageBreaks.includes(item.id)} onToggle={() => onTogglePageBreak(item.id)} />
              {/if}
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
              {#if idx > 0 && onTogglePageBreak}
                <PageBreakDivider active={pageBreaks.includes(item.id)} onToggle={() => onTogglePageBreak(item.id)} />
              {/if}
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
  {#if onChangeExtraNotes}
    <div class="mt-3 border-t border-dashed border-line-strong pt-3">
      <ExtraNotesField value={extraNotes} onChange={onChangeExtraNotes} idPrefix="examExtraNotes" />
    </div>
  {/if}
</Card>
