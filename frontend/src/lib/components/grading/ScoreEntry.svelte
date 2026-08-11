<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import { gradingStore } from "$lib/grading/gradingStore";

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
    "flex cursor-pointer items-center justify-between gap-[0.4rem] rounded-md border border-slate-700 bg-slate-800 px-2 py-[0.35rem] transition-all duration-150 ease-[ease] hover:border-slate-600 hover:bg-[#273549]";
  const itemActive =
    "flex cursor-pointer items-center justify-between gap-[0.4rem] rounded-md border border-sky-400 bg-sky-400/12 px-2 py-[0.35rem] shadow-[0_0_8px_rgba(56,189,248,0.15)] transition-all duration-150 ease-[ease]";
</script>

<div class="shrink-0 border-b border-slate-800 bg-slate-800 px-3 py-[0.6rem]">
  <h3 class="m-0 text-sm font-bold text-sky-400">Exercises ({exercises.length})</h3>
  <span class="text-[0.675rem] text-slate-500">Click row to set stamp target</span>
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
        <span class="text-[0.8rem] font-bold text-slate-100">Q{ex.orderIndex}{#if ex.subIndex}&nbsp;{String.fromCharCode(96 + ex.subIndex)}){/if}</span>
        {#if ex.id === $gradingStore.activeExerciseId}
          <span class="text-xs" title="Stamp Target">🎯</span>
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
          class="w-12 rounded border border-slate-700 bg-slate-900 px-[0.3rem] py-[0.2rem] text-right text-[0.8rem] font-bold text-sky-400"
        />
        <span class="text-[0.725rem] text-slate-400">/ {ex.maxPoints}</span>
        <button
          type="button"
          class="cursor-pointer rounded-[3px] bg-transparent px-[0.3rem] py-0 text-[0.9rem] leading-none text-slate-500 transition-colors duration-150 ease-[ease] hover:bg-red-500/15 hover:text-red-500"
          title="Als unkorrigiert zurücksetzen"
          on:click={(e) => resetScore(ex, e)}>×</button>
      </div>

      {#if $gradingStore.manualOverride[ex.id]}
        <span class="text-base leading-none text-amber-500" title="Manually edited">•</span>
      {/if}
    </div>
  {/each}
</div>
