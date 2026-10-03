<script lang="ts">
  // Leaf grading component — subscribes to gradingStore directly, per the scoped
  // exception documented in $lib/grading/gradingStore.ts. Renders for the active
  // exercise whenever it's mc/sc/tf; ScoreEntry's numeric input keeps working
  // alongside it (toggling an option here writes straight into scoreInputs).
  import type { ExerciseRecord } from "$lib/db/schema";
  import { gradingStore } from "$lib/grading/gradingStore";
  import { applyMcCorrection, type McQuestionType } from "$lib/grading/mcScore";
  import { isMcReviewed } from "$lib/grading/mcVerification";
  import { t } from "$lib/i18n";
  import { faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
  import { Alert, Icon } from "$lib/components/ui";

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
  $: reasonsByOption = new Map(
    (omrMeta?.detections?.bubbles ?? []).map((b) => [b.optionIndex, b.reasons ?? []])
  );
  $: provisionalByOption = new Map(
    (omrMeta?.detections?.bubbles ?? [])
      .filter((b) => b.detectedState === "ambiguous" && b.provisional !== undefined && !isMcReviewed(omrMeta))
      .map((b) => [b.optionIndex, b.provisional as boolean])
  );
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

<div class="shrink-0 border-t border-line bg-surface-raised px-3 py-2">
  <h4 class="m-0 mb-1.5 text-sm font-semibold text-content">{$t("grading.mcReview.title")}</h4>

  {#if alignmentFailed}
    <Alert severity="danger">{$t("grading.mcReview.alignmentFailed")}</Alert>
  {:else}
    {#if multiMarkWarning}
      <Alert severity="warning" class="mb-1.5">{$t("grading.mcReview.multiMarkWarning")}</Alert>
    {/if}

    <div class="flex flex-col gap-1">
      {#each options as opt, idx}
        {@const isSelected = selectedOptions.includes(idx)}
        {@const isCorrect = correctAnswers.includes(idx)}
        {@const isFlagged = flaggedOptions.has(idx)}
        <button
          type="button"
          on:click={() => toggleOption(idx)}
          class="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-left text-sm transition-colors pointer-coarse:min-h-11
            {isSelected ? 'border-primary bg-highlight' : 'border-line bg-surface-sunken'}
            {isFlagged ? 'border-dashed border-warning' : ''}"
        >
          <span class="flex-1 text-content">{opt}</span>
          {#if isSelected}
            <Icon icon={isCorrect ? faCheck : faXmark} class={isCorrect ? "text-success-fg" : "text-danger-fg"} />
          {/if}
          {#if isFlagged}
            <span
              class="text-warning-fg"
              title={[
                $t("grading.mcReview.uncertainMark"),
                ...(reasonsByOption.get(idx) ?? []).map((r) => $t(`scanning.itemCard.reason.${r}`)),
                ...(provisionalByOption.has(idx)
                  ? [provisionalByOption.get(idx) ? $t("scanning.itemCard.provisionalTicked") : $t("scanning.itemCard.provisionalNotTicked")]
                  : []),
              ].join(" · ")}>?</span>
          {/if}
        </button>
      {/each}
    </div>

    {#if omrMeta}
      <div class="mt-1 text-sm text-muted">
        {$t("grading.mcReview.source", { source: omrMeta.source === "omr" ? $t("grading.mcReview.sourceAuto") : $t("grading.mcReview.sourceManual") })}
        {#if omrMeta.source === "omr"}
          {$t("grading.mcReview.confidence", { confidence: omrMeta.confidence })}
        {/if}
      </div>
    {/if}
  {/if}
</div>
