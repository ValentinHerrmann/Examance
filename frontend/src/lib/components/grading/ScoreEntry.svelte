<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import { gradingStore } from "$lib/grading/gradingStore";
  import { t } from "$lib/i18n";

  export let exercises: ExerciseRecord[];

  function selectExercise(id: string) {
    gradingStore.setActiveExerciseId(id);
  }

  function handleScoreInput(ex: ExerciseRecord, e: Event) {
    const target = e.currentTarget as HTMLInputElement;
    const raw = target.value.trim();
    gradingStore.setManualOverrideFlag(ex.id, true);
    if (raw === '') {
      gradingStore.setScoreInput(ex.id, null);
    } else {
      const parsed = parseFloat(raw);
      gradingStore.setScoreInput(ex.id, isNaN(parsed) ? null : Math.max(0, Math.min(ex.maxPoints, parsed)));
    }
  }

  function resetScore(ex: ExerciseRecord, e: MouseEvent) {
    e.stopPropagation();
    gradingStore.setScoreInput(ex.id, null);
    gradingStore.setManualOverrideFlag(ex.id, false);
  }

  const itemBase =
    "flex cursor-pointer items-center justify-between gap-[0.4rem] rounded-md border border-line bg-surface-raised px-2 py-[0.35rem] transition-all duration-150 ease-[ease] hover:border-line-strong hover:bg-[#273549]";
  const itemActive =
    "flex cursor-pointer items-center justify-between gap-[0.4rem] rounded-md border border-primary bg-highlight px-2 py-[0.35rem] shadow-[0_0_8px_rgba(56,189,248,0.15)] transition-all duration-150 ease-[ease]";
</script>

<div class="shrink-0 border-b border-line bg-surface-raised px-3 py-[0.6rem]">
  <h3 class="m-0 text-sm font-bold text-accent">{$t("grading.scoreEntry.title", { count: exercises.length })}</h3>
  <span class="text-xs text-muted">{$t("grading.scoreEntry.hint")}</span>
</div>

<div class="flex flex-1 min-h-0 flex-col gap-[0.35rem] overflow-y-auto p-2">
  {#each exercises as ex}
    <div
      class={ex.id === $gradingStore.activeExerciseId ? itemActive : itemBase}
      on:click={() => selectExercise(ex.id)}
      role="button"
      tabindex="0"
      on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectExercise(ex.id); }}
    >
      <div class="flex items-center gap-1">
        <span class="text-xs font-bold text-content">Q{ex.orderIndex}{#if ex.subIndex}&nbsp;{String.fromCharCode(96 + ex.subIndex)}){/if}</span>
        {#if ex.id === $gradingStore.activeExerciseId}
          <span class="text-xs" title={$t("grading.scoreEntry.stampTarget")}>🎯</span>
        {/if}
      </div>

      <div class="flex items-center gap-1">
        <input
          id={`score-${ex.id}`}
          type="number"
          step="0.25"
          min="0"
          max={ex.maxPoints}
          placeholder="–"
          value={$gradingStore.scoreInputs[ex.id] ?? ''}
          on:input={(e) => handleScoreInput(ex, e)}
          class="min-h-9 w-14 rounded-sm border border-line bg-surface-base px-1.5 py-1 text-right text-sm font-bold text-accent"
        />
        <span class="text-xs text-muted">/ {ex.maxPoints}</span>
        <button
          type="button"
          class="cursor-pointer rounded-sm bg-transparent px-[0.3rem] py-0 text-sm leading-none text-muted transition-colors duration-150 ease-[ease] hover:bg-danger/15 hover:text-danger-fg"
          title={$t("grading.scoreEntry.resetTitle")}
          on:click={(e) => resetScore(ex, e)}>×</button>
      </div>

      {#if $gradingStore.manualOverride[ex.id]}
        <span class="text-base leading-none text-warning-fg" title={$t("grading.scoreEntry.manualEdit")}>•</span>
      {/if}
    </div>
  {/each}
</div>
