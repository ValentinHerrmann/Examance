<script module lang="ts">
  export interface ExamItemRef {
    type: "exercise" | "mc_group";
    id: string;
  }
</script>

<script lang="ts">
  import type { ExerciseRecord } from '$lib/db/schema';
  import { parseExerciseScore } from '$lib/latex/scoreParser';
  import { mcSubLabel } from '$lib/grading/mcGroupLabels';
  import ExerciseLabel from '$lib/components/exam/ExerciseLabel.svelte';
  import { t } from '$lib/i18n';
  import { faArrowUp, faArrowDown, faXmark } from '@fortawesome/free-solid-svg-icons';
  import { Badge, Button } from '$lib/components/ui';

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

  const rowClass = "mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface-raised px-4 py-3";
  const infoClass = "flex min-w-0 flex-wrap items-center gap-3";
  const actionsClass = "flex shrink-0 gap-1";

  let totalItemCount = $derived(examItems.length > 0 ? examItems.length : exercises.length + mcGroups.length);
</script>

<div class="mb-6 min-w-0">
  <h2 class="mb-3 text-xl font-semibold text-content">{$t("exam.exerciseList.heading", { count: totalItemCount })}</h2>

  {#if examItems.length > 0}
    {#each examItems as item, idx (item.id)}
      {#if item.type === "exercise"}
        {@const exercise = exercises.find((e) => e.id === item.id) || libraryExercises.find((e) => e.id === item.id)}
        {#if exercise}
          <div class={rowClass}>
            <div class={infoClass}>
              <span class="font-semibold text-muted">{idx + 1}.</span>
              <span class="min-w-0 text-content"><ExerciseLabel {exercise} /></span>
              {#if exercise.topicTag}
                <Badge severity="secondary">{exercise.topicTag}</Badge>
              {/if}
              {#if exercise.questionType && exercise.questionType !== 'free_text'}
                <Badge severity="primary">{exercise.questionType.toUpperCase()}</Badge>
              {/if}
              <span class="text-sm text-muted">{exercise.maxPoints} {$t("exam.exerciseList.points")}</span>
            </div>
            <div class={actionsClass}>
              <Button
                size="sm" variant="text" severity="secondary" iconOnly icon={faArrowUp}
                ariaLabel={$t("exam.mcStagingPanel.moveUp")}
                onClick={() => onMoveExamItem ? onMoveExamItem(idx, "up") : (onMoveUp && onMoveUp(idx))}
                disabled={idx === 0}
              />
              <Button
                size="sm" variant="text" severity="secondary" iconOnly icon={faArrowDown}
                ariaLabel={$t("exam.mcStagingPanel.moveDown")}
                onClick={() => onMoveExamItem ? onMoveExamItem(idx, "down") : (onMoveDown && onMoveDown(idx))}
                disabled={idx === examItems.length - 1}
              />
              <Button
                size="sm" variant="text" severity="danger" iconOnly icon={faXmark}
                ariaLabel={$t("exam.mcStagingPanel.remove")}
                onClick={() => onRemove(exercise.id)}
              />
            </div>
          </div>
        {/if}
      {:else if item.type === "mc_group"}
        {@const group = mcGroups.find((g) => g.id === item.id)}
        {#if group}
          <div class="{rowClass} flex-col items-stretch gap-1.5">
            <div class="flex w-full min-w-0 items-center justify-between gap-2">
              <div class={infoClass}>
                <span class="font-semibold text-muted">{idx + 1}.</span>
                <strong class="min-w-0 text-content">{$t("exam.exerciseList.mcGroupLabel", { title: group.title })}</strong>
                <Badge severity="primary">{$t("exam.exerciseList.subExercisesCount", { count: memberExercises(group).length })}</Badge>
                <span class="text-sm text-muted">{groupPoints(group)} {$t("exam.exerciseList.points")}</span>
              </div>
              <div class={actionsClass}>
                {#if onEditMcGroup}
                  <Button
                    size="sm" variant="text"
                    onClick={() => onEditMcGroup(group.id)}
                    title={$t("exam.exerciseList.editGroup")}
                  >{$t("exam.exerciseList.editGroupButton")}</Button>
                {/if}
                {#if onMoveExamItem}
                  <Button
                    size="sm" variant="text" severity="secondary" iconOnly icon={faArrowUp}
                    ariaLabel={$t("exam.mcStagingPanel.moveUp")}
                    onClick={() => onMoveExamItem && onMoveExamItem(idx, "up")}
                    disabled={idx === 0}
                  />
                  <Button
                    size="sm" variant="text" severity="secondary" iconOnly icon={faArrowDown}
                    ariaLabel={$t("exam.mcStagingPanel.moveDown")}
                    onClick={() => onMoveExamItem && onMoveExamItem(idx, "down")}
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
    {#each exercises as exercise, i (exercise.id)}
      <div class={rowClass}>
        <div class={infoClass}>
          <span class="font-semibold text-muted">{i + 1}.</span>
          <span class="min-w-0 text-content"><ExerciseLabel {exercise} /></span>
          {#if exercise.topicTag}
            <Badge severity="secondary">{exercise.topicTag}</Badge>
          {/if}
          {#if exercise.questionType && exercise.questionType !== 'free_text'}
            <Badge severity="primary">{exercise.questionType.toUpperCase()}</Badge>
          {/if}
          <span class="text-sm text-muted">{exercise.maxPoints} {$t("exam.exerciseList.points")}</span>
        </div>
        <div class={actionsClass}>
          <Button size="sm" variant="text" severity="secondary" iconOnly icon={faArrowUp} ariaLabel={$t("exam.mcStagingPanel.moveUp")} onClick={() => onMoveUp && onMoveUp(i)} disabled={i === 0} />
          <Button size="sm" variant="text" severity="secondary" iconOnly icon={faArrowDown} ariaLabel={$t("exam.mcStagingPanel.moveDown")} onClick={() => onMoveDown && onMoveDown(i)} disabled={i === exercises.length - 1} />
          <Button size="sm" variant="text" severity="danger" iconOnly icon={faXmark} ariaLabel={$t("exam.mcStagingPanel.remove")} onClick={() => onRemove(exercise.id)} />
        </div>
      </div>
    {/each}

    {#each mcGroups as group (group.id)}
      <div class="{rowClass} flex-col items-stretch gap-1.5">
        <div class="flex w-full min-w-0 items-center justify-between gap-2">
          <div class={infoClass}>
            <strong class="min-w-0 text-content">{$t("exam.exerciseList.mcGroupLabel", { title: group.title })}</strong>
            <Badge severity="primary">{$t("exam.exerciseList.subExercisesCount", { count: memberExercises(group).length })}</Badge>
            <span class="text-sm text-muted">{groupPoints(group)} {$t("exam.exerciseList.points")}</span>
          </div>
          <div class={actionsClass}>
            {#if onEditMcGroup}
              <Button
                size="sm" variant="text"
                onClick={() => onEditMcGroup(group.id)}
                title={$t("exam.exerciseList.editGroup")}
              >{$t("exam.exerciseList.editGroupButton")}</Button>
            {/if}
            {#if onRemoveMcGroup}
              <Button size="sm" variant="text" severity="danger" iconOnly icon={faXmark} ariaLabel={$t("exam.mcStagingPanel.remove")} onClick={() => onRemoveMcGroup(group.id)} />
            {/if}
          </div>
        </div>
        <ul class="m-0 pl-6 text-sm text-muted">
          {#each memberExercises(group) as ex, i}
            <li>{mcSubLabel(i, group.memberIds.length)}) <ExerciseLabel exercise={ex} /></li>
          {/each}
        </ul>
      </div>
    {/each}
  {/if}

  {#if totalItemCount === 0}
    <p class="m-0 rounded-md border border-dashed border-line-strong bg-surface-raised p-8 text-center text-muted">{$t("exam.exerciseList.empty")}</p>
  {/if}
</div>
