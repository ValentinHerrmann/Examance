<script context="module" lang="ts">
  export interface ExamItemRef {
    type: "exercise" | "mc_group";
    id: string;
  }
</script>

<script lang="ts">
  import "./ExerciseList.css";
  import type { ExerciseRecord } from '$lib/db/schema';
  import { parseExerciseScore } from '$lib/latex/scoreParser';
  import { t } from '$lib/i18n';

  interface McGroup {
    id: string;
    title: string;
    scoringText: string;
    memberIds: string[];
  }

  export let exercises: ExerciseRecord[];
  export let mcGroups: McGroup[] = [];
  export let libraryExercises: ExerciseRecord[] = [];
  export let examItems: ExamItemRef[] = [];
  export let onRemove: (exerciseId: string) => void;
  export let onMoveUp: ((index: number) => void) | undefined = undefined;
  export let onMoveDown: ((index: number) => void) | undefined = undefined;
  export let onMoveExamItem: ((index: number, direction: "up" | "down") => void) | undefined = undefined;
  export let onRemoveMcGroup: ((groupId: string) => void) | undefined = undefined;
  export let onEditMcGroup: ((groupId: string) => void) | undefined = undefined;

  function memberExercises(group: McGroup): ExerciseRecord[] {
    return group.memberIds
      .map((id) => libraryExercises.find((e) => e.id === id) || exercises.find((e) => e.id === id))
      .filter((e): e is ExerciseRecord => Boolean(e));
  }

  function groupPoints(group: McGroup): number {
    return memberExercises(group).reduce(
      (sum, ex) => sum + (parseExerciseScore(ex.latexBody || "") || ex.maxPoints || 0),
      0,
    );
  }

  $: totalItemCount = examItems.length > 0 ? examItems.length : exercises.length + mcGroups.length;
</script>

<div class="exercise-list">
  <h3>{$t("exam.exerciseList.heading", { count: totalItemCount })}</h3>

  {#if examItems.length > 0}
    {#each examItems as item, idx (item.id)}
      {#if item.type === "exercise"}
        {@const exercise = exercises.find((e) => e.id === item.id) || libraryExercises.find((e) => e.id === item.id)}
        {#if exercise}
          <div class="exercise-item">
            <div class="exercise-info">
              <span class="exercise-number">{idx + 1}.</span>
              <span class="exercise-title">{exercise.name || exercise.title || $t("exam.exerciseList.untitled")}</span>
              {#if exercise.topicTag}
                <span class="exercise-tag topic">{exercise.topicTag}</span>
              {/if}
              {#if exercise.questionType && exercise.questionType !== 'free_text'}
                <span class="exercise-tag topic" style="background-color: #0284c7; color: white;">{exercise.questionType.toUpperCase()}</span>
              {/if}
              {#if exercise.variantKey}
                <span class="exercise-tag variant">{$t("exam.exerciseList.variant", { key: exercise.variantKey })}</span>
              {/if}
              <span class="exercise-tag version">v{exercise.version || 1}</span>
              <span class="exercise-points">{exercise.maxPoints} {$t("exam.exerciseList.points")}</span>
            </div>
            <div class="exercise-actions">
              <button
                class="exercise-move-btn"
                on:click={() => onMoveExamItem ? onMoveExamItem(idx, "up") : (onMoveUp && onMoveUp(idx))}
                disabled={idx === 0}
              >↑</button>
              <button
                class="exercise-move-btn"
                on:click={() => onMoveExamItem ? onMoveExamItem(idx, "down") : (onMoveDown && onMoveDown(idx))}
                disabled={idx === examItems.length - 1}
              >↓</button>
              <button class="exercise-remove-btn" on:click={() => onRemove(exercise.id)}>✕</button>
            </div>
          </div>
        {/if}
      {:else if item.type === "mc_group"}
        {@const group = mcGroups.find((g) => g.id === item.id)}
        {#if group}
          <div class="exercise-item" style="flex-direction: column; align-items: stretch; gap: 0.4rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <div class="exercise-info">
                <span class="exercise-number">{idx + 1}.</span>
                <strong class="exercise-title">{$t("exam.exerciseList.mcGroupLabel", { title: group.title })}</strong>
                <span class="exercise-tag topic" style="background-color: #0369a1; color: white;">{$t("exam.exerciseList.subExercisesCount", { count: memberExercises(group).length })}</span>
                <span class="exercise-points">{groupPoints(group)} {$t("exam.exerciseList.points")}</span>
              </div>
              <div class="exercise-actions">
                {#if onEditMcGroup}
                  <button
                    type="button"
                    class="exercise-edit-btn"
                    on:click={() => onEditMcGroup(group.id)}
                    style="background: none; border: none; color: #38bdf8; cursor: pointer; font-size: 0.85rem; padding: 0 4px;"
                    title={$t("exam.exerciseList.editGroup")}
                  >{$t("exam.exerciseList.editGroupButton")}</button>
                {/if}
                {#if onMoveExamItem}
                  <button
                    type="button"
                    class="exercise-move-btn"
                    on:click={() => onMoveExamItem && onMoveExamItem(idx, "up")}
                    disabled={idx === 0}
                  >↑</button>
                  <button
                    type="button"
                    class="exercise-move-btn"
                    on:click={() => onMoveExamItem && onMoveExamItem(idx, "down")}
                    disabled={idx === examItems.length - 1}
                  >↓</button>
                {/if}
                {#if onRemoveMcGroup}
                  <button class="exercise-remove-btn" on:click={() => onRemoveMcGroup(group.id)}>✕</button>
                {/if}
              </div>
            </div>
            <ul style="margin: 0; padding-left: 1.4rem; font-size: 0.85rem; color: #94a3b8;">
              {#each memberExercises(group) as ex, i}
                <li>{String.fromCharCode(97 + i)}) {ex.name}</li>
              {/each}
            </ul>
          </div>
        {/if}
      {/if}
    {/each}
  {:else}
    {#each exercises as exercise, i (exercise.id)}
      <div class="exercise-item">
        <div class="exercise-info">
          <span class="exercise-number">{i + 1}.</span>
          <span class="exercise-title">{exercise.name || exercise.title || $t("exam.exerciseList.untitled")}</span>
          {#if exercise.topicTag}
            <span class="exercise-tag topic">{exercise.topicTag}</span>
          {/if}
          {#if exercise.questionType && exercise.questionType !== 'free_text'}
            <span class="exercise-tag topic" style="background-color: #0284c7; color: white;">{exercise.questionType.toUpperCase()}</span>
          {/if}
          {#if exercise.variantKey}
            <span class="exercise-tag variant">{$t("exam.exerciseList.variant", { key: exercise.variantKey })}</span>
          {/if}
          <span class="exercise-tag version">v{exercise.version || 1}</span>
          <span class="exercise-points">{exercise.maxPoints} {$t("exam.exerciseList.points")}</span>
        </div>
        <div class="exercise-actions">
          <button class="exercise-move-btn" on:click={() => onMoveUp && onMoveUp(i)} disabled={i === 0}>↑</button>
          <button class="exercise-move-btn" on:click={() => onMoveDown && onMoveDown(i)} disabled={i === exercises.length - 1}>↓</button>
          <button class="exercise-remove-btn" on:click={() => onRemove(exercise.id)}>✕</button>
        </div>
      </div>
    {/each}

    {#each mcGroups as group (group.id)}
      <div class="exercise-item" style="flex-direction: column; align-items: stretch; gap: 0.4rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div class="exercise-info">
            <strong class="exercise-title">{$t("exam.exerciseList.mcGroupLabel", { title: group.title })}</strong>
            <span class="exercise-tag topic" style="background-color: #0369a1; color: white;">{$t("exam.exerciseList.subExercisesCount", { count: memberExercises(group).length })}</span>
            <span class="exercise-points">{groupPoints(group)} {$t("exam.exerciseList.points")}</span>
          </div>
          <div class="exercise-actions">
            {#if onEditMcGroup}
              <button
                type="button"
                class="exercise-edit-btn"
                on:click={() => onEditMcGroup(group.id)}
                style="background: none; border: none; color: #38bdf8; cursor: pointer; font-size: 0.85rem; padding: 0 4px;"
                title={$t("exam.exerciseList.editGroup")}
              >{$t("exam.exerciseList.editGroupButton")}</button>
            {/if}
            {#if onRemoveMcGroup}
              <button class="exercise-remove-btn" on:click={() => onRemoveMcGroup(group.id)}>✕</button>
            {/if}
          </div>
        </div>
        <ul style="margin: 0; padding-left: 1.4rem; font-size: 0.85rem; color: #94a3b8;">
          {#each memberExercises(group) as ex, i}
            <li>{String.fromCharCode(97 + i)}) {ex.name}</li>
          {/each}
        </ul>
      </div>
    {/each}
  {/if}

  {#if totalItemCount === 0}
    <div class="empty-exercises">
      <p>{$t("exam.exerciseList.empty")}</p>
    </div>
  {/if}
</div>
