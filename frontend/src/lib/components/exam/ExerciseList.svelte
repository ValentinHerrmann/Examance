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
  import { variantOf, versionOf } from '#lib/components/exam/ExerciseLabel.svelte';
  import PageBreakDivider from '#lib/components/exam/PageBreakDivider.svelte';
  import { t } from '#lib/i18n';
  import { faArrowUp, faArrowDown, faCodeBranch, faPlus, faTag, faXmark } from '@fortawesome/free-solid-svg-icons';
  import InfoTip from '#lib/components/help/InfoTip.svelte';
  import { Badge, Button, Card, Icon, actionIcons } from '#lib/components/ui';

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
    onOpenExercise = undefined
  }: Props = $props();

  function memberExercises(group: McGroup): ExerciseRecord[] {
    return group.memberIds
      // `exercises` first: it is the authoritative per-exam copy, and `libraryExercises` may still be loading (or hold a different variant of the same id). Same precedence as resolveMcExercises().
      .map((id) => exercises.find((e) => e.id === id) || libraryExercises.find((e) => e.id === id))
      .filter((e): e is ExerciseRecord => Boolean(e));
  }

  /** Points of the whole exam as the list shows them, for the summary line. */
  let totalPoints = $derived(
    exercises.filter((ex) => !mcGroups.some((g) => g.memberIds.includes(ex.id))).reduce((sum, ex) => sum + (ex.maxPoints || 0), 0) +
      mcGroups.reduce((sum, g) => sum + groupPoints(g), 0),
  );

  function groupPoints(group: McGroup): number {
    return memberExercises(group).reduce(
      (sum, ex) => sum + (parseExerciseScore(ex.latexBody || "") || ex.maxPoints || 0),
      0,
    );
  }

  // Card per item (issue #212): number dot, name in the text colour (wraps, never cut off) and points on the first line; coloured chips with icons and the actions on the second, so on a phone the name gets the full width.
  const cardClass = "flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-surface-raised px-3 py-2.5 transition-colors hover:border-line-strong";
  const numberClass = "flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-accent tabular-nums";
  const nameClass = "min-w-0 flex-1 break-words text-left font-semibold text-content";
  const pointsClass = "shrink-0 rounded-md bg-surface-inset px-2 py-0.5 text-sm font-semibold whitespace-nowrap text-content tabular-nums";
  const actionsClass = "-my-1 ml-auto flex shrink-0 items-center";

  let totalItemCount = $derived(examItems.length > 0 ? examItems.length : exercises.length + mcGroups.length);
</script>

{#snippet moveButtons(idx: number, count: number, up: () => void, down: () => void)}
  <Button size="sm" variant="text" severity="secondary" iconOnly icon={faArrowUp} ariaLabel={$t("exam.mcStagingPanel.moveUp")} title={$t("exam.mcStagingPanel.moveUp")} onClick={up} disabled={idx === 0} />
  <Button size="sm" variant="text" severity="secondary" iconOnly icon={faArrowDown} ariaLabel={$t("exam.mcStagingPanel.moveDown")} title={$t("exam.mcStagingPanel.moveDown")} onClick={down} disabled={idx === count - 1} />
{/snippet}

{#snippet name(exercise: ExerciseRecord, cls: string)}
  {#if onOpenExercise}
    <button type="button" class="{cls} cursor-pointer border-0 bg-transparent p-0 hover:underline" onclick={() => onOpenExercise(exercise)}>{exercise.name || $t("exam.exerciseLabel.untitled")}</button>
  {:else}
    <span class={cls}>{exercise.name || $t("exam.exerciseLabel.untitled")}</span>
  {/if}
{/snippet}

<!-- Variant, version, topic and question type, each with its own colour and icon. -->
{#snippet chips(exercise: ExerciseRecord, withTopic = true)}
  {@const variant = variantOf(exercise)}
  {@const version = versionOf(exercise)}
  {#if exercise.questionType && exercise.questionType !== 'free_text'}
    <Badge severity="primary" title={$t("exam.exerciseList.typeTitle")}>{exercise.questionType.toUpperCase()}</Badge>
  {/if}
  {#if variant}<Badge severity="info" icon={faCodeBranch} title={$t("exam.exerciseLabel.variantTitle")}>{variant}</Badge>{/if}
  {#if version}<Badge severity="secondary">v{version}</Badge>{/if}
  {#if withTopic && exercise.topicTag}<Badge severity="success" icon={faTag} title={$t("exam.exerciseList.topicTitle")}>{exercise.topicTag}</Badge>{/if}
{/snippet}

{#snippet exerciseRow(exercise: ExerciseRecord, idx: number, count: number, up: () => void, down: () => void)}
  <div class={cardClass}>
    <div class="flex min-w-0 items-center gap-2.5">
      <span class={numberClass}>{idx + 1}</span>
      {@render name(exercise, nameClass)}
      <span class={pointsClass}>{exercise.maxPoints} {$t("exam.exerciseList.points")}</span>
    </div>
    <div class="flex min-w-0 flex-wrap items-center gap-1.5 sm:pl-8.5">
      {@render chips(exercise)}
      <div class={actionsClass}>
        {#if onOpenExercise}
          <Button size="sm" variant="text" severity="secondary" iconOnly icon={actionIcons.edit} ariaLabel={$t("exam.exerciseList.editExercise")} title={$t("exam.exerciseList.editExercise")} onClick={() => onOpenExercise(exercise)} />
        {/if}
        {@render moveButtons(idx, count, up, down)}
        <Button size="sm" variant="text" severity="danger" iconOnly icon={faXmark} ariaLabel={$t("exam.mcStagingPanel.remove")} title={$t("exam.mcStagingPanel.remove")} onClick={() => onRemove(exercise.id)} />
      </div>
    </div>
  </div>
{/snippet}

<!-- `idx` is null in the unordered fallback list: no number, no move buttons. -->
{#snippet groupRow(group: McGroup, idx: number | null)}
  <div class={cardClass}>
    <div class="flex min-w-0 items-center gap-2.5">
      <span class={numberClass}>{idx === null ? "" : idx + 1}</span>
      <span class={nameClass}>{$t("exam.exerciseList.mcGroupLabel", { title: group.title })}</span>
      <span class={pointsClass}>{groupPoints(group)} {$t("exam.exerciseList.points")}</span>
    </div>
    <div class="flex min-w-0 flex-wrap items-center gap-1.5 sm:pl-8.5">
      <Badge severity="primary">{$t("exam.exerciseList.subExercisesCount", { count: memberExercises(group).length })}</Badge>
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
    <ul class="m-0 flex list-none sm:ml-8.5 flex-col gap-1.5 border-l-2 border-primary/40 p-0 pl-3">
      {#each memberExercises(group) as ex, i}
        <li class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span class="font-semibold text-muted">{mcSubLabel(i, group.memberIds.length)})</span>
          {@render name(ex, "min-w-0 break-words text-left text-content")}
          {@render chips(ex, false)}
        </li>
      {/each}
    </ul>
  </div>
{/snippet}

<Card padded={false} class="p-3 sm:p-5" title={$t("exam.exerciseList.heading", { count: totalItemCount })}>
  {#snippet actions()}
    <!-- Guidance behind ⓘ, like the Print step (issue #228). -->
    <InfoTip text={$t("exam.exerciseList.info")} />
    {#if onAddExercises && totalItemCount > 0}
      <Button size="sm" icon={actionIcons.add} onClick={onAddExercises}>{$t("exam.exerciseList.addExercises")}</Button>
    {/if}
  {/snippet}

  {#if totalItemCount === 0}
    <!-- The first step as a tile: what to do and the one action that does it. -->
    {#if onAddExercises}
      <button type="button" class="flex w-full cursor-pointer items-start gap-3 rounded-md border border-dashed border-line-strong bg-surface-sunken p-4 text-left hover:border-line-hover" onclick={onAddExercises}>
        <Icon icon={faPlus} class="mt-0.5 shrink-0 text-accent" />
        <span class="min-w-0">
          <span class="block font-medium text-content">{$t("exam.exerciseList.addExercises")}</span>
          <span class="block text-sm text-muted">{$t("exam.exerciseList.emptyText")}</span>
        </span>
      </button>
    {:else}
      <p class="m-0 rounded-md border border-dashed border-line-strong p-8 text-center text-muted">{$t("exam.exerciseList.empty")}</p>
    {/if}
  {:else}
    <p class="m-0 mb-3 text-sm text-muted">{$t("exam.exerciseList.summary", { count: totalItemCount, points: totalPoints })}</p>
    <div class="flex flex-col {onTogglePageBreak ? '' : 'gap-2'}">
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
</Card>
