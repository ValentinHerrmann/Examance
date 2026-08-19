<script lang="ts">
  // Leaf grading component — subscribes to gradingStore directly, per the scoped
  // exception documented in $lib/grading/gradingStore.ts. Renders for the active
  // exercise whenever it's mc/sc/tf; ScoreEntry's numeric input keeps working
  // alongside it (toggling an option here writes straight into scoreInputs).
  import type { ExerciseRecord } from "$lib/db/schema";
  import { gradingStore } from "$lib/grading/gradingStore";
  import { applyMcCorrection, type McQuestionType } from "$lib/grading/mcScore";
  import { t } from "$lib/i18n";

  export let exercise: ExerciseRecord;

  $: mcState = $gradingStore.mcState[exercise.id];
  $: selectedOptions = mcState?.selectedOptions ?? [];
  $: omrMeta = mcState?.omrMeta;
  $: correctAnswers = exercise.correctAnswers ?? [];
  $: options = exercise.options ?? [];
  $: questionType = exercise.questionType as McQuestionType;
  $: isSingleAnswer = questionType === "sc" || questionType === "tf";
  $: alignmentFailed = omrMeta?.confidence === "failed";
  $: flaggedOptions = new Set(omrMeta?.flaggedOptions ?? []);
  $: multiMarkWarning = isSingleAnswer && selectedOptions.length > 1;

  function toggleOption(idx: number) {
    const { nextSelectedOptions, nextScore, nextOmrMeta } = applyMcCorrection(
      questionType,
      selectedOptions,
      idx,
      correctAnswers,
      exercise.penalty ?? 0,
      exercise.maxPoints,
      omrMeta
    );

    gradingStore.setMcStateForExercise(exercise.id, {
      selectedOptions: nextSelectedOptions,
      omrMeta: nextOmrMeta,
    });

    gradingStore.setScoreInput(exercise.id, nextScore);
    gradingStore.setManualOverrideFlag(exercise.id, true);
  }
</script>

<div class="shrink-0 border-t border-slate-700 bg-slate-800 px-3 py-2">
  <h4 class="m-0 mb-1.5 text-xs font-bold text-sky-400">{$t("grading.mcReview.title")}</h4>

  {#if alignmentFailed}
    <div class="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-[0.7rem] text-red-400">
      {$t("grading.mcReview.alignmentFailed")}
    </div>
  {:else}
    {#if multiMarkWarning}
      <div class="mb-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[0.7rem] text-amber-400">
        {$t("grading.mcReview.multiMarkWarning")}
      </div>
    {/if}

    <div class="flex flex-col gap-1">
      {#each options as opt, idx}
        {@const isSelected = selectedOptions.includes(idx)}
        {@const isCorrect = correctAnswers.includes(idx)}
        {@const isFlagged = flaggedOptions.has(idx)}
        <button
          type="button"
          on:click={() => toggleOption(idx)}
          class="flex items-center justify-between gap-2 rounded border px-2 py-1 text-left text-[0.75rem] transition-colors duration-150 ease-[ease]
            {isSelected ? 'border-sky-400 bg-sky-400/15' : 'border-slate-700 bg-slate-900'}
            {isFlagged ? 'border-dashed border-amber-500' : ''}"
        >
          <span class="flex-1 text-slate-200">{opt}</span>
          {#if isSelected}
            <span class={isCorrect ? "text-emerald-400" : "text-red-400"}>{isCorrect ? "✓" : "✗"}</span>
          {/if}
          {#if isFlagged}
            <span class="text-amber-500" title={$t("grading.mcReview.uncertainMark")}>?</span>
          {/if}
        </button>
      {/each}
    </div>

    {#if omrMeta}
      <div class="mt-1 text-[0.65rem] text-slate-500">
        {$t("grading.mcReview.source", { source: omrMeta.source === "omr" ? $t("grading.mcReview.sourceAuto") : $t("grading.mcReview.sourceManual") })}
        {#if omrMeta.source === "omr"}
          {$t("grading.mcReview.confidence", { confidence: omrMeta.confidence })}
        {/if}
      </div>
    {/if}
  {/if}
</div>
