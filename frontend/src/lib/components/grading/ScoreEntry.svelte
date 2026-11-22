<script lang="ts">
  import type { ExerciseRecord } from "#lib/db/schema";
  import { gradingStore } from "#lib/grading/gradingStore";
  import { t } from "#lib/i18n";
  import ScoreRow from "./ScoreRow.svelte";
  import { exerciseParts, hasPartValues, partOverrideKey, REST_KEY, restMax } from "#lib/grading/partScores";
  import { exerciseTag, resetExercise, resetPart, setPart, setTotal } from "#lib/grading/scoreEdits";

  interface Props {
    exercises: ExerciseRecord[];
    /** Enter in a score field steps to the next target. */
    onStep?: (dir: 1 | -1) => void;
  }

  let { exercises, onStep }: Props = $props();
  let onEnter = $derived(onStep ? () => onStep(1) : undefined);

  function isTarget(ex: ExerciseRecord, label: string): boolean {
    return $gradingStore.activeExerciseId === ex.id && $gradingStore.activePartLabel === label;
  }

  /** The points-outside-the-parts row: shown when the exercise has such points or stamps landed there (then only to correct them, never as the target, issue #234). */
  function showRest(ex: ExerciseRecord): boolean {
    return exerciseParts(ex).length > 0 && (restMax(ex) > 0 || $gradingStore.partInputs[ex.id]?.[REST_KEY] != null);
  }

  /** An exercise with parts is graded only through them (issue #330): its row selects the first part. */
  function selectExercise(ex: ExerciseRecord) {
    gradingStore.setActivePart(ex.id, exerciseParts(ex)[0]?.label ?? "");
  }
</script>

<!-- One flat list: hairlines between rows, a stronger line between exercises; no gaps or frames that cost width (issue #328). The card header carries the totals, so no title row (issue #330). -->
<div class="flex min-h-0 flex-1 flex-col divide-y divide-line-strong overflow-y-auto" role="group" aria-label={$t("grading.scoreEntry.title", { count: exercises.length })}>
  {#each exercises as ex (ex.id)}
    {@const parts = $gradingStore.partInputs[ex.id]}
    {@const hasParts = exerciseParts(ex).length > 0}
    <div class="divide-y divide-line">
    <ScoreRow
      value={$gradingStore.scoreInputs[ex.id]}
      max={ex.maxPoints}
      active={!hasParts && isTarget(ex, "")}
      manual={!!$gradingStore.manualOverride[ex.id] && !hasPartValues(parts)}
      readonlyReason={hasParts ? $t("grading.scoreEntry.sumOfParts") : undefined}
      inputId={`score-${ex.id}`}
      reviewKey={ex.id}
      {onEnter}
      onSelect={() => selectExercise(ex)}
      onValue={(v) => setTotal(ex, v)}
      onReset={() => resetExercise(ex)}
    >
      {#snippet label()}
        <!-- Plain text, no link to the exercise editor: a pen or palm tapped it by accident while grading (issue #233). -->
        <span class="text-sm font-bold text-content">{exerciseTag(ex)}</span>
      {/snippet}
    </ScoreRow>
    {#each exerciseParts(ex) as part (part.label)}
      <ScoreRow
        nested
        value={parts?.[part.label]}
        max={part.max}
        active={isTarget(ex, part.label)}
        manual={!!$gradingStore.manualOverride[partOverrideKey(ex.id, part.label)]}
        ariaLabel={$t("grading.scoreEntry.partRowLabel", { label: part.label })}
        inputId={`score-${ex.id}-${part.label}`}
        reviewKey={partOverrideKey(ex.id, part.label)}
        {onEnter}
        onSelect={() => gradingStore.setActivePart(ex.id, part.label)}
        onValue={(v) => setPart(ex, part.label, v)}
        onReset={() => resetPart(ex, part.label)}
      >
        {#snippet label()}<span class="sr-only">{$t("grading.scoreEntry.partRowLabel", { label: part.label })}</span><span class="font-semibold text-content" aria-hidden="true">{part.label})</span>{/snippet}
      </ScoreRow>
    {/each}
    {#if showRest(ex)}
      {@const rest = parts?.[REST_KEY]}
      <ScoreRow
        nested
        value={rest}
        max={ex.maxPoints}
        maxLabel={restMax(ex)}
        active={restMax(ex) > 0 && isTarget(ex, "")}
        manual={!!$gradingStore.manualOverride[partOverrideKey(ex.id, REST_KEY)]}
        warning={rest != null && rest > restMax(ex) ? $t("grading.scoreEntry.restOverMax", { max: restMax(ex) }) : undefined}
        ariaLabel={$t("grading.scoreEntry.restRowLabel")}
        inputId={`score-${ex.id}-${REST_KEY}`}
        {onEnter}
        onSelect={() => (restMax(ex) > 0 ? gradingStore.setActivePart(ex.id, "") : selectExercise(ex))}
        onValue={(v) => setPart(ex, REST_KEY, v)}
        onReset={() => resetPart(ex, REST_KEY)}
      >
        {#snippet label()}<span class="font-semibold text-content">{$t("grading.scoreEntry.restRowLabel")}</span>{/snippet}
      </ScoreRow>
    {/if}
    </div>
  {/each}
</div>
